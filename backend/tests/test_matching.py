"""Real PostgreSQL integration tests. Uses a throwaway isolated cluster (unix socket only, port 55440)."""
import json
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.matching import benchmark, db, decisions, retrieval, text
from app.matching.pgcluster import Cluster
from app.matching.routes import get_live_transport
from app.matching.store import PostIn, Query, import_records

NOW = datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="session")
def cluster():
    root = Path(tempfile.mkdtemp(prefix="pgt"))
    cl = Cluster(root=root, port=55440, dbname="t")
    cl.start()
    yield cl
    cl.stop()
    shutil.rmtree(root, ignore_errors=True)


@pytest.fixture()
def conn(cluster):
    c = db.connect(cluster.dsn())
    c.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
    db.migrate(c)
    yield c
    c.close()


@pytest.fixture()
def client(cluster, conn):
    def dep():
        c = db.connect(cluster.dsn())
        try:
            yield c
        finally:
            c.close()
    app.dependency_overrides[db.get_db] = dep
    yield TestClient(app)
    app.dependency_overrides.clear()


def post(eid, **kw):
    d = dict(source="user", record_kind="synthetic", external_id=eid, kind="offer", title="t " + eid)
    d.update(kw)
    return PostIn(**d)


def test_no_tcp_listener(cluster):
    with db.connect(cluster.dsn()) as c:
        assert c.execute("SHOW listen_addresses").fetchone()["listen_addresses"] == ""


def test_migrate_idempotent(conn):
    assert db.migrate(conn) == []


def test_import_upsert_and_provenance(conn):
    r = import_records(conn, "c", [post("a", title="Stan", source="reddit", record_kind="live_imported",
                                        provenance={"job": "x"})])
    assert r == {"inserted": 1, "updated": 0, "unchanged": 0}
    assert import_records(conn, "c", [post("a", title="Stan", source="reddit", record_kind="live_imported",
                                           provenance={"job": "x"})])["unchanged"] == 1
    assert import_records(conn, "c", [post("a", title="Stan 2", source="reddit", record_kind="live_imported")])["updated"] == 1
    row = conn.execute("SELECT * FROM posts").fetchone()
    assert row["record_kind"] == "live_imported" and row["source"] == "reddit" and row["neighbourhood_id"] is None


def test_generated_tsvector_and_gin_used(conn):
    import_records(conn, "c", [post(f"x{i}", title=f"zvuk{i} predmet") for i in range(300)] + [post("t", title="Trešnjevka stan")])
    conn.execute("ANALYZE posts")
    conn.execute("SET enable_seqscan = off")
    plan = "\n".join(r["QUERY PLAN"] for r in conn.execute(
        "EXPLAIN SELECT id FROM posts WHERE search @@ to_tsquery('simple','tresnjev:*')"))
    assert "posts_search_gin" in plan
    # diacritics folded at import
    assert conn.execute("SELECT count(*) n FROM posts WHERE search @@ to_tsquery('simple','tresnjev:*')").fetchone()["n"] == 1


def test_negative_constraints_and_unknown_separate(conn):
    import_records(conn, "c", [
        post("ok", title="stan", city="Zagreb", price_eur=400, neighbourhood_id="maksimir"),
        post("unk", title="stan"),                                          # unknown city/price/neighbourhood
        post("far", title="stan", city="Split"),                            # known mismatch
        post("dear", title="stan", city="Zagreb", price_eur=900),           # known mismatch
        post("hood", title="stan", city="Zagreb", neighbourhood_id="trnje"),  # known mismatch
        post("old", title="stan", city="Zagreb", expires_at=datetime(2026, 1, 1, tzinfo=timezone.utc)),
        post("same", title="stan", kind="request"),                         # same side
        post("kind?", title="stan", kind="unknown"),
    ])
    q = Query(kind="request", text="stan", city="Zagreb", neighbourhood_id="maksimir", max_price_eur=500)
    ids = {r["external_id"]: r for r in retrieval.brute(conn, "c", q, NOW)}
    assert set(ids) == {"ok", "unk", "kind?"}
    assert ids["ok"]["unknown_fields"] == ["expiry"]
    assert {"city", "neighbourhood", "price"} <= set(ids["unk"]["unknown_fields"])
    assert "kind" in ids["kind?"]["unknown_fields"]


def test_indexed_subset_of_brute_same_eligibility(conn):
    benchmark.load_fixture(conn)
    for q, _ in benchmark._queries(conn, benchmark.FIXTURE_CORPUS):
        b = {r["id"] for r in retrieval.brute(conn, benchmark.FIXTURE_CORPUS, q, NOW)}
        i = {r["id"] for r in retrieval.indexed(conn, benchmark.FIXTURE_CORPUS, q, NOW)["candidates"]}
        assert i <= b


def test_synonyms_and_declension():
    q, terms = text.build_tsquery("Trebam sofu")
    assert "kauc" in terms and "trosjed" in terms and q
    assert "stan" in text.expand(text.tokens("apartman"))
    assert "bicikl" not in text.expand(text.tokens("stan"))        # conservative: no cross-group leakage


def test_indexed_truncation_reported(conn):
    import_records(conn, "c", [post(f"s{i}", title="stan") for i in range(10)])
    ix = retrieval.indexed(conn, "c", Query(kind="request", text="stan"), NOW, max_candidates=4)
    assert ix["truncated"] and len(ix["candidates"]) == 4 and ix["matched"] is None


def test_fixture_labels_diverse():
    d = json.loads(benchmark.FIXTURE.read_text())
    assert d["synthetic"] and 15 <= len(d["queries"]) <= 30
    assert any(not q["labels"] for q in d["queries"])
    assert any(p.get("expires_at") for p in d["posts"]) and any(p["city"] is None for p in d["posts"])


def test_dry_run_http_no_scoring_metrics(client, monkeypatch):
    def boom(*a, **k):
        raise AssertionError("provider must not be called")
    monkeypatch.setattr(decisions, "score_pair", boom)
    r = client.post("/matching/benchmark/dry-run", json={"load_fixture": True, "max_api_calls": 500})
    assert r.status_code == 200
    j = r.json()
    assert j["scoring_metrics"] is None and j["mode"] == "dry_run"
    assert j["planned"]["brute_force_api_calls"] == 177 and j["planned"]["within_limit"] is True
    assert j["planned"]["calls_saved_by_index_vs_brute"] > 0
    assert j["retrieval"]["totals"]["retrieval_recall_vs_labels"] is not None
    assert not any(k in json.dumps(j) for k in ("latency_ms", "agreement", "cost"))
    r2 = client.post("/matching/benchmark/dry-run", json={"max_api_calls": 10})
    assert r2.json()["planned"]["within_limit"] is False
    assert client.post("/matching/benchmark/dry-run", json={}).status_code == 422


def test_import_and_retrieve_http(client):
    r = client.post("/matching/records/import", json={"corpus": "m", "records": [
        {"source": "user", "record_kind": "user_contributed", "external_id": "1", "kind": "offer", "title": "Prodajem bicikl",
         "city": "Zagreb"}]})
    assert r.json()["result"]["inserted"] == 1
    q = {"corpus": "m", "query": {"kind": "request", "text": "trebam bicikl", "city": "Zagreb"}, "now": NOW.isoformat()}
    for mode in ("indexed", "brute"):
        j = client.post("/matching/retrieve", json={**q, "mode": mode}).json()
        assert j["results"][0]["external_id"] == "1" and j["results"][0]["untrusted_content"] is True
    assert client.post("/matching/records/import", json={"records": [{"source": "x"}]}).status_code == 422


def test_import_reddit_previous_output_no_fetch(client, conn):
    cand = {"title": "Tražim stan", "body": "Zagreb", "redditUrl": "https://www.reddit.com/r/zagreb/comments/abc1/",
            "redditId": "abc1", "posted": "2026-10-07T10:00:00+00:00", "subreddit": "zagreb",
            "location": {"status": "zagreb_mention_candidate", "city": "Zagreb", "neighbourhoods": ["Trnje"]},
            "provenance": {"source": "reddit"}}
    j = client.post("/matching/records/import-reddit", json={"candidates": [cand]}).json()
    assert j["result"]["inserted"] == 1
    row = conn.execute("SELECT record_kind, source, neighbourhood_id, provenance FROM posts").fetchone()
    assert row["record_kind"] == "live_imported" and row["neighbourhood_id"] is None
    assert row["provenance"]["verified_live"] is False


def test_neighbourhoods_endpoint(client):
    r = client.get("/matching/neighbourhoods")
    assert r.status_code == 200
    j = r.json()
    assert len(j["entries"]) == 238 and j["counts"]["total"] == 238
    assert "does not imply" in j["coverage_note"] and isinstance(j["entries"][0]["id"], str)


def _probs(pr):
    return [{"value": i, "label": decisions.LEVELS[i], "probability": x} for i, x in enumerate(pr)]


# ---- decisions client + live path with mock transport (never real network) ----
def _handler(fail=None):
    seen = []

    def h(req):
        body = json.loads(req.content)
        seen.append((req, body))
        assert str(req.url) == decisions.URL and body["model"] == "gpt-6-luna"
        q = body["questions"][0]
        assert q["type"] == "score" and q["name"] == "relevance" and len(q["levels"]) == 3
        if fail == "refusal":
            return httpx.Response(200, json={"refusal": "no"})
        if fail == "malformed":
            return httpx.Response(200, json={"answers": [{"name": "relevance", "score": 5}]})
        if fail == "500":
            return httpx.Response(500, text="secret provider text")
        hit = "stan" in body["input"].lower().split("objava")[1]
        pr = [0.1, 0.1, 0.8] if hit else [0.9, 0.1, 0.0]
        return httpx.Response(200, json={"answers": [{"type": "score", "name": "relevance", "score": sum(i * x for i, x in enumerate(pr)),
                                                      "confidence": 0.9, "probabilities": _probs(pr)}],
                                         "usage": {"input_tokens": 200, "output_tokens": 0}})
    return h, seen


def test_parse_response_honest():
    assert decisions.parse_response({"answers": [{"type": "score", "name": "relevance", "score": 1.2}]}).usage_known is False
    assert decisions.parse_response([]).outcome == "malformed"
    assert decisions.parse_response({"refusal": "x"}).outcome == "refusal"
    s = decisions.parse_response({"answers": [{"type": "score", "name": "relevance", "score": 2.5}]})
    assert s.outcome == "malformed"


def test_live_requires_confirmation_limit_and_key(conn, monkeypatch):
    benchmark.load_fixture(conn)
    monkeypatch.setenv("OPENAI_API_KEY", "k-test")
    h, seen = _handler()
    with pytest.raises(benchmark.BenchmarkError) as e:
        benchmark.live_run(conn, benchmark.FIXTURE_CORPUS, NOW, 500, 0.1, transport=httpx.MockTransport(h))
    assert e.value.code == "live_not_confirmed"
    with pytest.raises(benchmark.BenchmarkError) as e:
        benchmark.live_run(conn, benchmark.FIXTURE_CORPUS, NOW, 10, 0.1, transport=httpx.MockTransport(h), confirm_live=True)
    assert e.value.code == "exceeds_max_api_calls" and seen == []
    monkeypatch.delenv("OPENAI_API_KEY")
    with pytest.raises(benchmark.BenchmarkError) as e:
        benchmark.live_run(conn, benchmark.FIXTURE_CORPUS, NOW, 500, 0.1, transport=httpx.MockTransport(h), confirm_live=True)
    assert e.value.code == "missing_api_key" and seen == []


def test_live_run_mock_metrics(conn, monkeypatch):
    benchmark.load_fixture(conn)
    monkeypatch.setenv("OPENAI_API_KEY", "k-test")
    h, seen = _handler()
    s = benchmark.live_run(conn, benchmark.FIXTURE_CORPUS, NOW, 177, 0.10, transport=httpx.MockTransport(h), confirm_live=True)
    assert len(seen) == 177 == s["api_calls_made"]
    assert all(r.headers["authorization"] == "Bearer k-test" for r, _ in seen)
    assert s["indexed_provider_latency_measured"] is False and s["indexed_scores_reused_from_brute"] is True
    assert s["cost"]["kind"] == "estimate" and s["cost"]["usd"] == round(177 * 200 * 0.1 / 1e6, 8)
    assert s["model_agreement"]["note"].endswith("NOT ground truth.")
    assert conn.execute("SELECT count(*) n FROM benchmark_scores").fetchone()["n"] == 177
    assert "k-test" not in json.dumps(s)


def test_live_failures_not_success(conn, monkeypatch):
    benchmark.load_fixture(conn)
    monkeypatch.setenv("OPENAI_API_KEY", "k-test")
    h, _ = _handler("500")
    s = benchmark.live_run(conn, benchmark.FIXTURE_CORPUS, NOW, 177, 0.1, transport=httpx.MockTransport(h), confirm_live=True)
    assert s["scoring_incomplete"] and s["scored_ok"] == 0 and s["outcomes"] == {"http_error": 177}
    assert s["model_agreement"]["indexed_coverage_of_model_relevant"] is None
    assert "secret provider text" not in json.dumps(s)


def test_live_http_route_gated(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "k-test")
    h, seen = _handler()
    app.dependency_overrides[get_live_transport] = lambda: httpx.MockTransport(h)
    r = client.post("/matching/benchmark/live", json={"load_fixture": True, "max_api_calls": 500})
    assert r.status_code == 409 and r.json()["detail"]["error"]["code"] == "live_not_confirmed" and seen == []
    r = client.post("/matching/benchmark/live", json={"load_fixture": True, "max_api_calls": 500, "confirm_live": True})
    assert r.status_code == 200 and len(seen) == 177


def test_live_snapshot_mutation_cannot_exceed_cap(conn, monkeypatch):
    """Corpus mutates while scoring runs: calls stay at the approved plan and use the frozen rows."""
    benchmark.load_fixture(conn)
    monkeypatch.setenv("OPENAI_API_KEY", "k-test")
    h0, _ = _handler()
    seen = []

    def h(req):
        if not seen:   # first provider call: add many eligible rows and delete one scored post
            mut = db.connect(conn.info.dsn)
            import_records(mut, benchmark.FIXTURE_CORPUS, [post(f"new{i}", title="stan najam") for i in range(50)])
            mut.execute("DELETE FROM posts WHERE corpus=%s AND external_id='p01'", (benchmark.FIXTURE_CORPUS,))
            mut.close()
        seen.append(1)
        return h0(req)

    s = benchmark.live_run(conn, benchmark.FIXTURE_CORPUS, NOW, 177, 0.1, transport=httpx.MockTransport(h), confirm_live=True)
    assert len(seen) == 177 == s["api_calls_made"]
    assert s["snapshot"]["frozen_before_cap_check"] and s["snapshot"]["scores_not_persisted_post_deleted"] > 0
    assert s["truth_label_recall"]["labeled_relevant_eligible"] == 26


def test_truth_recall_reports_failures(conn, monkeypatch):
    benchmark.load_fixture(conn)
    monkeypatch.setenv("OPENAI_API_KEY", "k-test")
    h0, _ = _handler()
    n = {"i": 0}

    def h(req):
        n["i"] += 1
        return httpx.Response(500) if n["i"] % 2 == 0 else h0(req)

    s = benchmark.live_run(conn, benchmark.FIXTURE_CORPUS, NOW, 177, 0.1, transport=httpx.MockTransport(h), confirm_live=True,
                           concurrency=1)
    t = s["truth_label_recall"]
    assert t["failed_or_unscored"] > 0 and t["scored_ok"] + t["failed_or_unscored"] == t["labeled_relevant_eligible"] == 26
    assert t["end_to_end_recall"] == t["found_by_brute"] / 26
    assert t["recall_among_scored"] is None or t["recall_among_scored"] >= t["end_to_end_recall"]


def _ans(**kw):
    a = {"type": "score", "name": "relevance", "score": 1.7, "confidence": 0.8, "probabilities": _probs([0.1, 0.1, 0.8])}
    a.update(kw)
    return {"answers": [a], "usage": {"input_tokens": 50}}


def test_official_probability_records_preserved():
    s = decisions.parse_response(_ans(score=1.7))
    assert s.outcome == "ok" and s.probabilities[2] == {"value": 2, "label": "Strong", "probability": 0.8}
    assert s.confidence == 0.8 and s.input_tokens == 50


@pytest.mark.parametrize("bad", [
    {"confidence": 1.5}, {"confidence": -0.1}, {"confidence": float("nan")}, {"confidence": float("inf")},
    {"confidence": "0.9"}, {"confidence": True}, {"score": float("nan")}, {"score": 1.2},      # weighted mismatch
    {"probabilities": [0.1, 0.1, 0.8]},                                                     # old float list
    {"probabilities": _probs([0.5, 0.1, 0.8])},                                              # sums > 1
    {"probabilities": _probs([0.1, 0.1, 0.8])[:2]},
    {"probabilities": [{"value": 0, "label": "Strong", "probability": 0.1}] + _probs([0.1, 0.1, 0.8])[1:]},
    {"probabilities": [{"value": 7, "label": "x", "probability": 0.1}] + _probs([0.1, 0.1, 0.8])[1:]}])
def test_malformed_contract_rejected(bad):
    assert decisions.parse_response(_ans(**bad)).outcome == "malformed"


def test_confidence_optional_and_probabilities_optional():
    s = decisions.parse_response({"answers": [{"type": "score", "name": "relevance", "score": 0.4}]})
    assert s.outcome == "ok" and s.confidence is None and s.probabilities is None


def test_payload_is_structured_and_bounded():
    q = Query(kind="request", text="x" * 5000 if False else "trebam stan", city="Zagreb", neighbourhood_id="trnje",
              max_price_eur=500)
    row = {"kind": "unknown", "title": "t" * 900, "body": "b" * 9000, "city": None, "neighbourhood_id": None,
           "price_eur": None, "unknown_fields": ["kind", "city"], "expires_at": None}
    pl = decisions.build_payload(q, row)
    inp = pl["input"]
    assert '"kind": "request"' in inp and '"post_kind": "unknown"' in inp and '"max_price_eur": 500' in inp
    assert '"unknown_fields": ["kind", "city"]' in inp and "komplementarnost" in pl["questions"][0]["instructions"]
    assert len(inp) < 4000 and pl["model"] == "gpt-6-luna"


def test_refusal_answer_classified_first_and_type_required():
    r = decisions.parse_response({"answers": [{"type": "refusal", "name": "relevance", "refusal": "secret text"}]})
    assert r.outcome == "refusal" and r.score is None and "secret" not in repr(r)
    # refusal with stray numeric fields is still a refusal, never a score
    assert decisions.parse_response({"answers": [{"type": "refusal", "name": "relevance", "score": 1.0}]}).outcome == "refusal"
    assert decisions.parse_response({"answers": [{"type": "refusal", "name": "other"}]}).outcome == "refusal"
    # numeric success requires type score
    assert decisions.parse_response({"answers": [{"name": "relevance", "score": 1.0}]}).outcome == "malformed"
    assert decisions.parse_response({"answers": [{"type": "text", "name": "relevance", "score": 1.0}]}).outcome == "malformed"


def test_official_guide_example():
    s = decisions.parse_response({"answers": [{"type": "score", "name": "relevance", "score": 1.1, "confidence": 0.55,
                                               "probabilities": _probs([0.1, 0.7, 0.2])}]})
    assert s.outcome == "ok" and s.score == 1.1 and s.confidence == 0.55 and s.usage_known is False


@pytest.mark.parametrize("val", [[0], {"a": 1}, "0", None, 1.0, True])
def test_probability_value_type_checked(val):
    recs = _probs([0.1, 0.1, 0.8])
    recs[0] = {"value": val, "label": "Irrelevant", "probability": 0.1}
    assert decisions.parse_response(_ans(probabilities=recs)).outcome == "malformed"


def test_plan_single_snapshot_under_concurrent_insert(conn, cluster, monkeypatch):
    """A row inserted by another connection between brute and indexed must not enter candidates."""
    benchmark.load_fixture(conn)
    real = retrieval.indexed
    state = {"n": 0}

    def spy(c, corpus, q, now, mc=retrieval.MAX_CANDIDATES):
        if state["n"] == 0:
            other = db.connect(cluster.dsn())
            import_records(other, benchmark.FIXTURE_CORPUS, [post("late", title="stan najam garsonijera bicikl")])
            other.close()
        state["n"] += 1
        return real(c, corpus, q, now, mc)

    monkeypatch.setattr(retrieval, "indexed", spy)
    p = benchmark.plan(conn, benchmark.FIXTURE_CORPUS, NOW)
    assert state["n"] == 15 and conn.info.transaction_status.name == "IDLE"
    for qid, cand in p["_candidates"].items():
        assert cand <= p["_eligible"][qid]
    assert p["totals"]["brute_pairs"] == 177                       # late row invisible to the snapshot
    late = conn.execute("SELECT id FROM posts WHERE external_id='late'").fetchone()["id"]
    assert all(late not in c for c in p["_candidates"].values())
    assert benchmark.plan(conn, benchmark.FIXTURE_CORPUS, NOW)["totals"]["brute_pairs"] > 177   # next snapshot sees it
