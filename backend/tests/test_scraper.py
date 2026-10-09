import httpx
import pytest

from social_match import scraper, service

GROUP = "https://www.facebook.com/groups/example-group"


def mock(body, status=200, seen=None):
    def handler(req):
        if seen is not None:
            seen.append(req)
        return httpx.Response(status, json=body)
    return httpx.MockTransport(handler)


def test_dry_run_makes_no_call_and_estimates_cost():
    out = service.scrape_source("facebook", GROUP, 20)
    assert out["mode"] == "dry_run" and out["network_call_made"] is False
    assert out["plan"]["estimated_cost_usd"] == 0.1
    assert out["plan"]["body"]["params"]["groupUrls"] == GROUP


@pytest.mark.parametrize("url", [
    "http://www.facebook.com/groups/x", "https://evil.com/groups/x", "https://www.facebook.com/groups/x?a=1",
    "https://user:pw@www.facebook.com/groups/x", "https://www.facebook.com/pages/x", "https://www.facebook.com/groups/../x"])
def test_bad_facebook_targets_rejected(url):
    assert service.scrape_source("facebook", url, 5)["error"]["code"] == "invalid_target"


@pytest.mark.parametrize("n", [0, 101, True, "5", 1.5])
def test_limit_must_be_a_strict_bounded_int(n):
    assert service.scrape_source("facebook", GROUP, n)["error"]["code"] == "invalid_limit"


def test_only_two_subreddits():
    assert service.scrape_source("reddit", "zagreb", 5)["mode"] == "dry_run"
    assert service.scrape_source("reddit", "r/askcroatia", 5)["mode"] == "dry_run"
    assert service.scrape_source("reddit", "funny", 5)["error"]["code"] == "invalid_target"


def test_live_fails_closed_without_key(monkeypatch):
    monkeypatch.delenv("MINDCASE_API_KEY", raising=False)
    seen = []
    out = service.scrape_source("facebook", GROUP, 5, dry_run=False, confirm_paid=True, transport=mock({}, seen=seen))
    assert out["error"]["code"] == "not_configured" and not seen


def test_live_needs_explicit_paid_confirmation():
    seen = []
    out = service.scrape_source("facebook", GROUP, 5, dry_run=False, api_key="k" * 12, transport=mock({}, seen=seen))
    assert out["error"]["code"] == "confirmation_required" and not seen


def test_live_run_normalises_indexes_and_never_retries(conn):
    seen = []
    body = {"status": "completed", "job_id": "job-12345678", "data": [
        {"postId": "1", "postUrl": GROUP + "/posts/1", "text": "Iznajmljujem sobu, zovi 091 234 5678 ili a@b.hr",
         "postedAt": "2026-10-01T10:00:00Z", "source": {"url": GROUP}, "author": {"name": "Ana"}},
        {"postId": "2", "postUrl": "https://www.facebook.com/groups/other/posts/2", "text": "x",
         "postedAt": "2026-10-01T10:00:00Z", "source": {"url": "https://www.facebook.com/groups/other"}},
        {"postId": "1", "postUrl": GROUP + "/posts/1", "text": "duplicate", "postedAt": "2026-10-01T10:00:00Z"},
        {"postId": "3", "postUrl": GROUP + "/posts/3", "text": "future", "postedAt": "2999-01-01T00:00:00Z"},
        "garbage"]}
    out = service.scrape_source("facebook", GROUP, 5, dry_run=False, confirm_paid=True, api_key="sk-secret-key",
                                transport=mock(body, seen=seen), conn=conn)
    assert len(seen) == 1 and seen[0].method == "POST"
    assert out["kept"] == 1 and out["dropped"]["off_source"] == 1 and out["dropped"]["duplicate"] == 1
    assert out["dropped"]["future_date"] == 1 and out["dropped"]["malformed"] == 1
    rec = out["records"][0]
    assert "[phone removed]" in rec["body"] and "[email removed]" in rec["body"] and "author" not in str(rec)
    assert rec["record_kind"] == "live_imported" and rec["provenance"]["untrusted_content"] is True
    assert out["indexed"]["inserted"] == 1


def test_provider_errors_are_sanitised_and_key_redacted():
    out = service.scrape_source("facebook", GROUP, 5, dry_run=False, confirm_paid=True, api_key="sk-secret-key",
                                transport=mock({"error": "bad sk-secret-key"}, status=402))
    assert out["error"]["code"] == "provider_balance" and "sk-secret-key" not in str(out)
    ok = scraper.run(scraper.plan("facebook", GROUP, 5), confirm_paid=True, api_key="sk-secret-key",
                     transport=mock({"status": "completed", "message": "has sk-secret-key", "data": []}))
    assert "sk-secret-key" not in str(ok) and ok["provider"]["message"] == "[provider message withheld]"


def test_fetch_job_validates_id_and_is_a_get():
    assert service.fetch_scrape_job("../etc")["error"]["code"] == "invalid_job"
    seen = []
    out = service.fetch_scrape_job("job-12345678", api_key="k" * 12,
                                   transport=mock({"status": "running", "data": []}, seen=seen))
    assert seen[0].method == "GET" and out["terminal"] is False
