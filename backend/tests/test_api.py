import json
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app, get_transport
from app.config import get_settings

KEY = "sk-test-SECRET123"
JOB = str(uuid.uuid4())
GROUP = "https://www.facebook.com/groups/zagreb.stanovi"
calls: list[httpx.Request] = []


def make_client(handler, key=KEY):
    calls.clear()

    def wrapped(req):
        calls.append(req)
        return handler(req)

    app.dependency_overrides[get_transport] = lambda: httpx.MockTransport(wrapped)
    app.dependency_overrides[get_settings] = lambda: Settings(key, "https://api.mindcase.co/v1", 1, 2)
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clean():
    yield
    app.dependency_overrides.clear()


def ok(_):
    return httpx.Response(200, json={"job_id": JOB, "status": "completed", "results": [{"t": 1}]})


def test_valid_request_payload():
    c = make_client(ok)
    r = c.post("/scrapes/facebook-group", json={"group_url": "https://facebook.com/groups/zagreb.stanovi/",
                                                 "max_results": 5, "newer_than": "2026-01-02"})
    assert r.status_code == 200
    j = r.json()
    assert j["job_id"] == JOB and j["terminal"] is True and j["status"] == "completed"
    req = calls[0]
    assert str(req.url) == "https://api.mindcase.co/v1/data/facebook/posts/run?wait=true"
    assert req.method == "POST" and req.url.path == "/v1/data/facebook/posts/run"
    assert req.url.params["wait"] == "true"
    assert req.headers["authorization"] == f"Bearer {KEY}"
    assert json.loads(req.content) == {"params": {"groupUrls": GROUP, "maxResults": 5,
                                                   "onlyPostsNewerThan": "2026-01-02"}}
    assert len(calls) == 1


def test_defaults_and_no_date():
    c = make_client(ok)
    c.post("/scrapes/facebook-group", json={"group_url": GROUP})
    assert json.loads(calls[0].content) == {"params": {"groupUrls": GROUP, "maxResults": 20}}


@pytest.mark.parametrize("n", [0, 101, -1, True, "5", 5.5, 5.0])
def test_limit_bounds(n):
    c = make_client(ok)
    assert c.post("/scrapes/facebook-group", json={"group_url": GROUP, "max_results": n}).status_code == 422
    assert not calls


def test_future_date_rejected():
    c = make_client(ok)
    assert c.post("/scrapes/facebook-group", json={"group_url": GROUP, "newer_than": "2999-01-01"}).status_code == 422


@pytest.mark.parametrize("url", [
    "http://facebook.com/groups/abc",
    "https://facebook.com.evil.com/groups/abc",
    "https://evilfacebook.com/groups/abc",
    "https://user:pw@facebook.com/groups/abc",
    "https://facebook.com@evil.com/groups/abc",
    "https://facebook.com/groups/abc/posts/1",
    "https://facebook.com/groups/",
    "https://facebook.com/pages/abc",
    "https://facebook.com/groups/abc?x=1",
    "https://facebook.com/groups/abc#f",
    "https://facebook.com:8080/groups/abc",
    "https://example.com/",
    "https://facebook.com/groups/a b",
    "https://facebook.com/groups/..",
    "file:///etc/passwd",
])
def test_bad_urls(url):
    c = make_client(ok)
    assert c.post("/scrapes/facebook-group", json={"group_url": url}).status_code == 422
    assert not calls


def test_extra_fields_rejected():
    c = make_client(ok)
    assert c.post("/scrapes/facebook-group", json={"group_url": GROUP, "cookies": "x"}).status_code == 422


def test_missing_key():
    c = make_client(ok, key=None)
    r = c.post("/scrapes/facebook-group", json={"group_url": GROUP})
    assert r.status_code == 503 and r.json()["error"]["code"] == "not_configured" and not calls


@pytest.mark.parametrize("up,exp,code", [(401, 502, "provider_auth"), (402, 402, "provider_balance"),
                                         (429, 429, "provider_rate_limited"), (500, 502, "provider_unavailable"),
                                         (503, 502, "provider_unavailable"), (400, 502, "provider_rejected")])
def test_upstream_errors_sanitized_no_retry(up, exp, code):
    c = make_client(lambda r: httpx.Response(up, json={"error": f"bad key {KEY}"}))
    r = c.post("/scrapes/facebook-group", json={"group_url": GROUP})
    assert r.status_code == exp and r.json()["error"]["code"] == code
    assert KEY not in r.text and len(calls) == 1


def test_non_json():
    c = make_client(lambda r: httpx.Response(200, text="<html>"))
    r = c.post("/scrapes/facebook-group", json={"group_url": GROUP})
    assert r.status_code == 502 and r.json()["error"]["code"] == "provider_bad_response"


def test_timeout_no_retry():
    def boom(req):
        raise httpx.ReadTimeout("slow", request=req)
    c = make_client(boom)
    r = c.post("/scrapes/facebook-group", json={"group_url": GROUP})
    assert r.status_code == 504 and len(calls) == 1


def test_connect_error():
    def boom(req):
        raise httpx.ConnectError(f"no {KEY}", request=req)
    c = make_client(boom)
    r = c.post("/scrapes/facebook-group", json={"group_url": GROUP})
    assert r.status_code == 502 and KEY not in r.text


@pytest.mark.parametrize("st", ["completed", "failed", "cancelled", "rejected_balance"])
def test_terminal_statuses(st):
    c = make_client(lambda r: httpx.Response(200, json={"status": st}))
    r = c.get(f"/scrapes/{JOB}/results")
    assert r.json()["terminal"] is True and r.json()["status"] == st
    assert calls[0].url.path == f"/v1/jobs/{JOB}/results"


def test_running_not_terminal():
    c = make_client(lambda r: httpx.Response(200, json={"status": "running"}))
    assert c.get(f"/scrapes/{JOB}/results").json()["terminal"] is False


def test_truncated_preserved():
    c = make_client(lambda r: httpx.Response(200, json={"status": "completed", "truncated": True,
                                                         "results": [1, 2]}))
    j = c.get(f"/scrapes/{JOB}/results").json()
    assert j["truncated"] is True and j["provider"]["results"] == [1, 2]


def test_failed_body_echoing_key_is_sanitized():
    body = {"status": "failed", "error": f"auth {KEY}", "message": "x", "notice": KEY,
            "items": [{"note": f"see {KEY}", "message": KEY}], "detail": {"a": KEY}}
    c = make_client(lambda r: httpx.Response(200, json=body))
    r = c.get(f"/scrapes/{JOB}/results")
    assert KEY not in r.text and r.json()["status"] == "failed"
    assert str(calls[0].url) == f"https://api.mindcase.co/v1/jobs/{JOB}/results"
    assert "[redacted]" in r.json()["provider"]["items"][0]["note"]


def test_run_failed_body_echoing_key_sanitized():
    c = make_client(lambda r: httpx.Response(200, json={"status": "failed", "error": KEY, "x": KEY}))
    r = c.post("/scrapes/facebook-group", json={"group_url": GROUP})
    assert KEY not in r.text


def test_bad_uuid():
    c = make_client(ok)
    assert c.get("/scrapes/not-a-uuid/results").status_code == 422 and not calls


def test_health_and_docs():
    c = make_client(ok)
    assert c.get("/health").json()["mindcase_key_configured"] is True
    assert c.get("/docs").status_code == 200
    assert "access-control-allow-origin" not in c.get("/health", headers={"Origin": "http://x"}).headers
