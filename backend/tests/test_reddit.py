import json
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from app import reddit
from app.config import Settings, get_settings
from app.main import app, get_transport

KEY = "sk-test-SECRET123"
JOB = str(uuid.uuid4())
NOW = datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc)
calls: list[httpx.Request] = []


def iso(days):
    return (NOW - timedelta(days=days)).isoformat()


def url(sub, pid):
    return f"https://www.reddit.com/r/{sub}/comments/{pid}/slug/"


def row(sub="zagreb", pid="abc1", days=1, title="Stan u Zagrebu", body="", **kw):
    r = {"title": title, "body": body, "redditUrl": url(sub, pid), "redditId": pid, "posted": iso(days)}
    r.update(kw)
    return r


def make_client(handler, key=KEY):
    calls.clear()

    def wrapped(req):
        calls.append(req)
        return handler(req)

    app.dependency_overrides[get_transport] = lambda: httpx.MockTransport(wrapped)
    app.dependency_overrides[get_settings] = lambda: Settings(key, "https://api.mindcase.co/v1", 1, 2)
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.setattr(reddit, "utcnow", lambda: NOW)
    reddit.reset_registry()
    yield
    app.dependency_overrides.clear()


def resp(rows, status="completed", **extra):
    return lambda _: httpx.Response(200, json={"job_id": JOB, "status": status, "data": rows, **extra})


POST_BODY = {"subreddit": "zagreb", "max_results": 10, "freshness_days": 7}


def test_posts_payload_and_normalisation():
    c = make_client(resp([row()]))
    r = c.post("/pilot/reddit/posts", json={**POST_BODY, "keyword": "stan"})
    assert r.status_code == 200
    req = calls[0]
    assert str(req.url) == "https://api.mindcase.co/v1/data/reddit/posts/run?wait=true"
    assert json.loads(req.content) == {"params": {"urls": "https://www.reddit.com/r/zagreb/", "maxResults": 10,
                                                  "sortBy": "new", "keyword": "stan"}}
    assert "timeRange" not in req.content.decode()
    j = r.json()
    cand = j["candidates"][0]
    assert cand["redditId"] == "abc1" and cand["untrusted_content"] is True
    assert cand["provenance"]["source"] == "reddit" and cand["provenance"]["record_kind"] == "live_imported"
    assert cand["provenance"]["verified_live"] is False
    assert cand["location"]["status"] == "zagreb_mention_candidate"
    assert j["job_id"] == JOB and j["terminal"] is True


def test_no_keyword_omitted():
    c = make_client(resp([]))
    c.post("/pilot/reddit/posts", json=POST_BODY)
    assert "keyword" not in json.loads(calls[0].content)["params"]


@pytest.mark.parametrize("bad", [
    {"subreddit": "zagreb", "freshness_days": 7},
    {"subreddit": "zagreb", "max_results": 10},
    {**POST_BODY, "max_results": 51}, {**POST_BODY, "max_results": 0}, {**POST_BODY, "max_results": "5"},
    {**POST_BODY, "freshness_days": 91}, {**POST_BODY, "freshness_days": 0},
    {**POST_BODY, "subreddit": "croatia"}, {**POST_BODY, "subreddit": "https://reddit.com/r/zagreb"},
    {**POST_BODY, "timeRange": "week"}, {**POST_BODY, "sortBy": "top"},
])
def test_post_request_validation(bad):
    c = make_client(resp([]))
    assert c.post("/pilot/reddit/posts", json=bad).status_code == 422
    assert not calls


def test_askcroatia_requires_explicit_zagreb():
    rows = [row("askcroatia", "a1", title="Best pizza?", body="anywhere in Croatia"),
            row("askcroatia", "a2", title="Najam", body="trazim stan na Trešnjevci"),
            row("askcroatia", "a3", title="Moving", body="to ZAGREB next month")]
    c = make_client(resp(rows))
    j = c.post("/pilot/reddit/posts", json={**POST_BODY, "subreddit": "askcroatia"}).json()
    ids = {x["redditId"] for x in j["candidates"]}
    assert ids == {"a2", "a3"}
    assert j["dropped"]["no_explicit_zagreb"] == 1
    a2 = next(x for x in j["candidates"] if x["redditId"] == "a2")
    assert a2["location"]["neighbourhoods"] == ["Trešnjevka"]
    assert a2["location"]["evidence"][0]["kind"] == "neighbourhood_mention"


def test_zagreb_sub_alone_does_not_assign_neighbourhood():
    loc = reddit.detect_location("Imam macku", "ko hoce", "zagreb")
    assert loc["status"] == "zagreb_subreddit_only" and loc["neighbourhoods"] == []
    assert loc["evidence"][0]["kind"] == "subreddit_context"
    assert reddit.detect_location("hi", "there", "askcroatia")["status"] == "unknown"


def test_neighbourhood_diacritics_and_inflection():
    loc = reddit.detect_location("Trešnjevka", "", "zagreb")
    assert loc["neighbourhoods"] == ["Trešnjevka"]
    assert reddit.detect_location("u Dubravi, Zagreb", "", "zagreb")["neighbourhoods"] == ["Dubrava"]
    assert reddit.detect_location("Dubrovnik", "", "askcroatia")["status"] == "unknown"


@pytest.mark.parametrize("text,name", [
    ("u Vrbanima", "Vrbani"), ("iz Vrbana", "Vrbani"), ("Trnsko", "Trnsko"), ("u Trnskom", "Trnsko"),
    ("Malešnici", "Malešnica"), ("Poljanicama", "Poljanice"), ("Utrina", "Utrina"), ("Utrine", "Utrina"),
    ("u Sesvetama", "Sesvete"), ("na Trešnjevci", "Trešnjevka"), ("Maksimiru", "Maksimir"),
])
def test_owner_neighbourhoods_and_inflections(text, name):
    assert name in reddit.detect_location(text, "", "zagreb")["neighbourhoods"]


def test_no_false_inflection_matches():
    assert reddit.detect_location("Dubravka i Trnavac", "", "zagreb")["neighbourhoods"] == []


def test_ambiguous_names_need_city_context():
    loc = reddit.detect_location("Stan u Dubravi", "", "askcroatia")
    assert loc["status"] == "unknown" and loc["neighbourhoods"] == [] and loc["ambiguous_names"] == ["Dubrava"]
    loc = reddit.detect_location("Stan u Dubravi", "", "zagreb")
    assert loc["status"] == "zagreb_subreddit_only" and loc["neighbourhoods"] == []
    loc = reddit.detect_location("Stan u Dubravi, Zagreb", "", "askcroatia")
    assert loc["status"] == "zagreb_mention_candidate" and loc["neighbourhoods"] == ["Dubrava"]
    assert loc["verification"].startswith("candidate")


def test_ambiguous_only_askcroatia_dropped():
    c = make_client(resp([row("askcroatia", "x1", title="Gornji grad", body="kafic")]))
    j = c.post("/pilot/reddit/posts", json={**POST_BODY, "subreddit": "askcroatia"}).json()
    assert j["candidates"] == [] and j["dropped"]["no_explicit_zagreb"] == 1


def test_location_uses_text_before_display_truncation():
    c = make_client(resp([row(title="Najam", body="x " * 1500 + "u Zagrebu", pid="long1")]))
    cand = c.post("/pilot/reddit/posts", json=POST_BODY).json()["candidates"][0]
    assert len(cand["body"]) == 2000 and cand["location"]["status"] == "zagreb_mention_candidate"
    assert cand["location"]["input_truncated"] is False


def test_location_input_cap_disclosed():
    c = make_client(resp([row(title="Najam", body="y" * 12000 + " Zagreb", pid="long2")]))
    cand = c.post("/pilot/reddit/posts", json={**POST_BODY}).json()["candidates"][0]
    assert cand["location"]["input_truncated"] is True and cand["location"]["status"] == "zagreb_subreddit_only"


def test_future_tolerance():
    near = (NOW + timedelta(minutes=2)).isoformat()
    far = (NOW + timedelta(minutes=30)).isoformat()
    c = make_client(resp([{**row(pid="f1"), "posted": near}, {**row(pid="f2"), "posted": far}]))
    j = c.post("/pilot/reddit/posts", json=POST_BODY).json()
    assert [x["redditId"] for x in j["candidates"]] == ["f1"] and j["dropped"]["future_date"] == 1


def test_date_filtering_and_malformed_dates():
    rows = [row(pid="p1", days=1), row(pid="p2", days=30),
            {**row(pid="p3"), "posted": "garbage"}, {**row(pid="p4"), "posted": None},
            {**row(pid="p5"), "posted": True}, {**row(pid="p6"), "posted": "2999-01-01T00:00:00Z"},
            {k: v for k, v in row(pid="p7").items() if k != "posted"},
            {**row(pid="p8"), "posted": int((NOW - timedelta(days=2)).timestamp() * 1000)},
            {**row(pid="p9"), "posted": int((NOW - timedelta(days=2)).timestamp())},
            {**row(pid="pa"), "posted": "nan"}]
    c = make_client(resp(rows))
    j = c.post("/pilot/reddit/posts", json=POST_BODY).json()
    assert {x["redditId"] for x in j["candidates"]} == {"p1", "p8", "p9"}
    d = j["dropped"]
    assert d["stale"] == 1 and d["future_date"] == 1 and d["unknown_date"] == 5


def test_malformed_rows_and_wrong_subreddit_and_dupes():
    rows = ["str", None, 5, {"title": "x"}, row("askcroatia", "z1", body="Zagreb"),
            {**row(pid="q1"), "redditUrl": "https://evil.com/r/zagreb/comments/q1/"},
            row(pid="d1"), row(pid="d1"), {**row(pid="e1"), "title": None, "body": None}]
    c = make_client(resp(rows))
    j = c.post("/pilot/reddit/posts", json=POST_BODY).json()
    assert [x["redditId"] for x in j["candidates"]] == ["d1"]
    assert j["dropped"]["wrong_subreddit"] == 1 and j["dropped"]["duplicate"] == 1
    assert j["dropped"]["malformed"] == 6


def test_untrusted_text_sanitised_and_bounded():
    c = make_client(resp([row(title="x\x00y" + "a" * 1000, body="b" * 5000)]))
    cand = c.post("/pilot/reddit/posts", json=POST_BODY).json()["candidates"][0]
    assert "\x00" not in cand["title"] and len(cand["title"]) <= 300 and len(cand["body"]) <= 2000
    assert "provider" not in c.post("/pilot/reddit/posts", json=POST_BODY).json()


def test_local_row_cap_and_truncation_preserved():
    rows = [row(pid=f"p{i}", days=1 + i / 100) for i in range(8)]
    c = make_client(resp(rows, truncated=True))
    j = c.post("/pilot/reddit/posts", json={**POST_BODY, "max_results": 3}).json()
    assert len(j["candidates"]) == 3 and j["capped_locally"] is True and j["truncated"] is True


def test_async_state_uses_original_filters_and_known_job_only():
    c = make_client(resp([row(pid="n1")], status="running"))
    j = c.post("/pilot/reddit/posts", json=POST_BODY).json()
    assert j["terminal"] is False and j["status"] == "running"
    c = make_client(resp([row(pid="n1"), row(pid="n2", days=40), row("askcroatia", "n3", body="Zagreb")]))
    r = c.get(f"/pilot/reddit/posts/jobs/{JOB}")
    assert r.status_code == 200
    assert [x["redditId"] for x in r.json()["candidates"]] == ["n1"]
    assert r.json()["filters"] == {"subreddit": "zagreb", "max_results": 10, "freshness_days": 7}
    assert calls[0].method == "GET" and calls[0].url.path == "/v1/jobs/%s/results" % JOB
    # callers cannot swap filters via query string
    r = c.get(f"/pilot/reddit/posts/jobs/{JOB}", params={"subreddit": "askcroatia", "max_results": 1, "freshness_days": 90})
    assert r.json()["filters"]["subreddit"] == "zagreb"


def test_unknown_job_409_no_provider_call_and_no_registry_seeding():
    c = make_client(resp([row(pid="seed1")]))
    other = str(uuid.uuid4())
    r = c.get(f"/pilot/reddit/posts/jobs/{other}")
    assert r.status_code == 409 and r.json()["error"]["code"] == "unknown_job" and not calls
    assert c.get(f"/pilot/reddit/comments/jobs/{other}").status_code == 409
    assert c.get("/pilot/reddit/posts/jobs/not-a-uuid").status_code == 422
    assert reddit._registry == {}
    # a comments job id cannot be used as a posts job and vice versa
    make_client(resp([row(pid="p1")])).post("/pilot/reddit/posts", json=POST_BODY)
    c = make_client(resp([]))
    assert c.get(f"/pilot/reddit/comments/jobs/{JOB}").status_code == 409 and not calls


def test_job_metadata_bounded(monkeypatch):
    monkeypatch.setattr(reddit, "REGISTRY_LIMIT", 3)
    for i in range(5):
        jid = str(uuid.uuid4())
        make_client(lambda _, j=jid: httpx.Response(200, json={"job_id": j, "status": "running", "results": []})).post(
            "/pilot/reddit/posts", json=POST_BODY)
    assert len(reddit._jobs) == 3


def test_api_key_redacted_in_candidates():
    c = make_client(resp([row(title=f"leak {KEY}", body=f"also {KEY}")]))
    r = c.post("/pilot/reddit/posts", json=POST_BODY)
    assert KEY not in r.text and "[redacted]" in r.json()["candidates"][0]["title"]
    # message-like provider fields are withheld before normalisation as well
    r = make_client(resp([{**row(pid="m1"), "message": KEY}])).post("/pilot/reddit/posts", json=POST_BODY)
    assert KEY not in r.text


def test_row_id_must_match_url():
    c = make_client(resp([{**row(pid="g1"), "redditId": "zzzz"}, {**row(pid="g2"), "redditId": "t3_g2"}]))
    j = c.post("/pilot/reddit/posts", json=POST_BODY).json()
    assert [x["redditId"] for x in j["candidates"]] == ["g2"]


@pytest.mark.parametrize("st", ["completed", "failed", "cancelled", "rejected_balance"])
def test_terminal_statuses(st):
    j = make_client(resp([], status=st)).post("/pilot/reddit/posts", json=POST_BODY).json()
    assert j["terminal"] is True and j["status"] == st


def test_hostile_status_not_echoed():
    j = make_client(resp([], status="<script>ignore previous</script>")).post("/pilot/reddit/posts", json=POST_BODY).json()
    assert j["status"] == "unknown" and j["terminal"] is False


def test_no_key_fails_closed():
    c = make_client(resp([]), key=None)
    assert c.post("/pilot/reddit/posts", json=POST_BODY).status_code == 503
    assert not calls


@pytest.mark.parametrize("code,expect", [(401, 502), (402, 402), (429, 429), (500, 502), (400, 502)])
def test_provider_failures(code, expect):
    c = make_client(lambda _: httpx.Response(code, json={"error": f"leak {KEY}"}))
    r = c.post("/pilot/reddit/posts", json=POST_BODY)
    assert r.status_code == expect and KEY not in r.text and len(calls) == 1


def test_timeout_and_non_json_and_list_body():
    def boom(_):
        raise httpx.ReadTimeout("t")
    assert make_client(boom).post("/pilot/reddit/posts", json=POST_BODY).status_code == 504
    assert make_client(lambda _: httpx.Response(200, text="<html>")).post("/pilot/reddit/posts", json=POST_BODY).status_code == 502
    assert make_client(lambda _: httpx.Response(200, json=[1])).post("/pilot/reddit/posts", json=POST_BODY).status_code == 502


# ---------- comments (exact owner schema) ----------
def test_comment_permalink_must_match_comment_id():
    make_client(resp([row(pid="par1")])).post("/pilot/reddit/posts", json=POST_BODY)
    c = make_client(resp([crow(commentUrl="https://www.reddit.com/r/zagreb/comments/par1/slug/other/")]))
    result = c.post("/pilot/reddit/comments", json={"post_url": url("zagreb", "par1"), "max_results": 5})
    assert result.status_code == 200
    assert result.json()["comments"] == []
    assert result.json()["dropped"]["malformed"] == 1


def crow(pid="par1", sub="zagreb", cid="c1", **kw):
    r = {"commentUrl": f"https://www.reddit.com/r/{sub}/comments/{pid}/slug/comment/{cid}/", "commentId": cid,
         "comment": "Ja imam stan", "posted": iso(1), "parentId": f"t3_{pid}", "postId": pid,
         "postUrl": url(sub, pid), "subreddit": sub}
    r.update(kw)
    return r


def qualify(pid="par1", sub="zagreb"):
    make_client(resp([row(sub, pid, body="Zagreb")])).post(
        "/pilot/reddit/posts", json={**POST_BODY, "subreddit": sub})


@pytest.mark.parametrize("u", [
    "https://www.reddit.com/r/croatia/comments/abc1/x/",
    "https://www.reddit.com/r/zagreb/",
    "https://www.reddit.com/r/zagreb/comments/abc1/x/?utm=1",
    "http://www.reddit.com/r/zagreb/comments/abc1/x/",
    "https://reddit.com.evil.com/r/zagreb/comments/abc1/x/",
    "https://evil.com/r/zagreb/comments/abc1/",
    "https://user@www.reddit.com/r/zagreb/comments/abc1/",
    "https://www.reddit.com/r/zagreb/comments/abc1/x/#c",
    "https://www.reddit.com/r/zagreb/comments/ab c1/",
    "https://www.reddit.com/user/bob/comments/abc1/",
    "https://www.reddit.com/r/zagreb/comments/abc1/x/y/z",
])
def test_disallowed_comment_urls(u):
    c = make_client(resp([]))
    assert c.post("/pilot/reddit/comments", json={"post_url": u, "max_results": 5}).status_code == 422
    assert not calls


def test_comments_require_qualifying_parent():
    c = make_client(resp([]))
    r = c.post("/pilot/reddit/comments", json={"post_url": url("zagreb", "never"), "max_results": 5})
    assert r.status_code == 409 and r.json()["error"]["code"] == "parent_not_qualified" and not calls


def test_comments_exact_schema_and_parent_context():
    qualify()
    rows = [crow(), crow(cid="c2", postId="t3_par1", parentId="t1_c1", comment="odgovor"),
            crow(cid="c3", postId="other"), crow(cid="c4", postUrl=url("zagreb", "other")),
            crow(cid="c5", postUrl=url("askcroatia", "par1")), crow(cid="c6", subreddit="askcroatia"),
            {k: v for k, v in crow(cid="c7").items() if k != "postUrl"},
            {k: v for k, v in crow(cid="c8").items() if k != "postId"},
            crow(cid="c9", postUrl="https://evil.com/r/zagreb/comments/par1/x/"),
            crow(cid="ca", comment=""), crow(cid="cb", commentId=None), "junk", None,
            crow(cid="cc", commentUrl="https://evil.com/x"),
            crow(cid="cd", commentUrl=f"https://www.reddit.com/r/zagreb/comments/other/s/comment/cd/"),
            crow(cid="c1"), crow(cid="ce", posted="nope", parentId="bogus")]
    c = make_client(resp(rows))
    r = c.post("/pilot/reddit/comments", json={"post_url": url("zagreb", "par1"), "max_results": 20})
    assert r.status_code == 200
    j = r.json()
    assert json.loads(calls[0].content) == {"params": {"inputs": "https://www.reddit.com/r/zagreb/comments/par1/",
                                                       "maxResults": 20, "includeComments": True}}
    assert calls[0].url.path == "/v1/data/reddit/comments/run" and calls[0].url.params["wait"] == "true"
    assert j["parent"]["redditId"] == "par1" and j["parent"]["location"]["status"] == "zagreb_mention_candidate"
    assert [x["commentId"] for x in j["comments"]] == ["c1", "c2", "ce"]
    c1, c2, ce = j["comments"]
    assert c1["commentUrl"] == "https://www.reddit.com/r/zagreb/comments/par1/comment/c1/"
    assert c1["parentId"] == "t3_par1" and c2["parentId"] == "t1_c1" and ce["parentId"] is None and ce["posted"] is None
    assert c1["postId"] == "par1" and c1["postUrl"] == url("zagreb", "par1").replace("/slug/", "/")
    assert all(x["untrusted_content"] and x["provenance"]["dataset"] == "comments" for x in j["comments"])
    d = j["dropped"]
    assert d["wrong_parent"] == 7 and d["no_text"] == 1 and d["duplicate"] == 1 and d["malformed"] == 5


def test_comments_old_wrong_field_names_rejected():
    qualify()
    legacy = [{"body": "x", "redditId": "c1", "redditUrl": url("zagreb", "par1")}]
    j = make_client(resp(legacy)).post("/pilot/reddit/comments", json={"post_url": url("zagreb", "par1"), "max_results": 5}).json()
    assert j["comments"] == [] and j["dropped"]["wrong_parent"] == 1


def test_comments_async_truncation_cap_and_original_parent():
    qualify("par2")
    qualify("par3")
    rows = [crow("par2", cid=f"i{i}") for i in range(5)] + [crow("par3", cid="x1")]
    c = make_client(resp(rows, status="running", truncated=True))
    j = c.post("/pilot/reddit/comments", json={"post_url": url("zagreb", "par2"), "max_results": 2}).json()
    assert j["terminal"] is False and j["truncated"] is True and len(j["comments"]) == 2 and j["capped_locally"] is True
    c = make_client(resp(rows))
    # query-string attempts to swap parent/cap are ignored: original parent and cap apply
    r = c.get(f"/pilot/reddit/comments/jobs/{JOB}", params={"post_url": url("zagreb", "par3"), "max_results": 50})
    assert r.status_code == 200
    jj = r.json()
    assert jj["parent"]["redditId"] == "par2" and len(jj["comments"]) == 2
    assert jj["dropped"]["wrong_parent"] == 1


def test_comments_limits_and_no_key():
    c = make_client(resp([]), key=None)
    assert c.post("/pilot/reddit/comments", json={"post_url": url("zagreb", "a"), "max_results": 51}).status_code == 422
    qualify("k1")
    c = make_client(resp([]), key=None)
    assert c.post("/pilot/reddit/comments", json={"post_url": url("zagreb", "k1"), "max_results": 5}).status_code == 503
    assert not calls


def test_comment_key_redacted():
    qualify()
    c = make_client(resp([crow(comment=f"x {KEY}")]))
    r = c.post("/pilot/reddit/comments", json={"post_url": url("zagreb", "par1"), "max_results": 5})
    assert KEY not in r.text


def test_legacy_results_envelope_not_accepted():
    c = make_client(lambda _: httpx.Response(200, json={"job_id": JOB, "status": "completed", "results": [row()]}))
    j = c.post("/pilot/reddit/posts", json=POST_BODY).json()
    assert j["candidates"] == [] and j["rows_seen"] == 0


def test_unknown_status_stops_polling():
    j = make_client(resp([], status="weird")).post("/pilot/reddit/posts", json=POST_BODY).json()
    assert j["stop_polling"] is True and j["terminal"] is False
    j = make_client(resp([], status="running")).post("/pilot/reddit/posts", json=POST_BODY).json()
    assert j["stop_polling"] is False
    j = make_client(lambda _: httpx.Response(200, json={"data": []})).post("/pilot/reddit/posts", json=POST_BODY).json()
    assert j["stop_polling"] is True
    assert make_client(resp([], status="failed")).post("/pilot/reddit/posts", json=POST_BODY).json()["stop_polling"] is True


@pytest.mark.parametrize("st", ["running", "failed", "weird"])
def test_non_completed_jobs_do_not_register_parents(st):
    j = make_client(resp([row(pid="np1")], status=st)).post("/pilot/reddit/posts", json=POST_BODY).json()
    assert j["parents_registered"] is False and j["partial"] is True and len(j["candidates"]) == 1
    assert reddit._registry == {}
    c = make_client(resp([]))
    assert c.post("/pilot/reddit/comments", json={"post_url": url("zagreb", "np1"), "max_results": 5}).status_code == 409


def test_completed_truncated_registers_but_disclosed_partial():
    j = make_client(resp([row(pid="tr1")], truncated=True)).post("/pilot/reddit/posts", json=POST_BODY).json()
    assert j["parents_registered"] is True and j["partial"] is True


def test_parent_eligibility_expires_with_freshness_window(monkeypatch):
    make_client(resp([row(pid="ex1", days=6)])).post("/pilot/reddit/posts", json=POST_BODY)  # eligible ~1 more day
    later = NOW + timedelta(days=2)
    monkeypatch.setattr(reddit, "utcnow", lambda: later)
    c = make_client(resp([]))
    r = c.post("/pilot/reddit/comments", json={"post_url": url("zagreb", "ex1"), "max_results": 5})
    assert r.status_code == 409 and not calls and url("zagreb", "ex1").replace("/slug/", "/") not in reddit._registry
