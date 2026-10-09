import httpx

from social_match import decisions, service
from social_match.models import Query


def decisions_transport(score, seen):
    def handler(req):
        import json
        body = json.loads(req.content)
        seen.append((req, body))
        answers = [{"name": qn["name"], "type": "score", "score": score, "confidence": 0.9} for qn in body["questions"]]
        return httpx.Response(200, json={"answers": answers})
    return httpx.MockTransport(handler)


def test_relevance_payload_matches_the_score_contract():
    q = Query(kind="request", text="stan", city="Zagreb")
    p = decisions.relevance_payload(q, {"kind": "offer", "title": "Stan", "body": "x"})
    assert p["model"] == decisions.MODEL and p["questions"][0]["type"] == "score"
    assert [l["label"] for l in p["questions"][0]["levels"]] == ["Irrelevant", "Possible", "Strong"]
    assert "untrusted" in p["input"]


def test_parse_score_rejects_malformed_and_refusal():
    assert decisions.parse_score({"answers": [{"name": "relevance", "type": "score", "score": 3}]}).outcome == "malformed"
    assert decisions.parse_score({"answers": [{"name": "relevance", "type": "refusal"}]}).outcome == "refusal"
    assert decisions.parse_score({"answers": [{"name": "relevance", "type": "score", "score": True}]}).outcome == "malformed"
    ok = decisions.parse_score({"answers": [{"name": "relevance", "type": "score", "score": 1.8, "confidence": 0.7}]})
    assert ok.outcome == "ok" and ok.level == "Strong"


def test_paid_search_with_mock_transport(demo):
    seen = []
    out = service.search_index(demo, {"kind": "request", "text": "stan najam", "city": "Zagreb"}, corpus="demo",
                               provider="decisions", confirm_paid=True, api_key="k" * 12,
                               transport=decisions_transport(2.0, seen))
    assert out["ai"] is True and out["suitable"] and seen
    assert all(r.headers["authorization"].startswith("Bearer ") for r, _ in seen)


def test_paid_classify_with_mock_transport():
    seen = []
    out = service.classify_record("Iznajmljujem garsonijeru", "decisions", True, api_key="k" * 12,
                                  transport=decisions_transport(2.0, seen))
    assert out["ai"] is True and out["outcome"] == "ok" and len(seen[0][1]["questions"]) == len(decisions.CATEGORIES)


def test_heuristic_classify_is_offline_and_labelled_not_ai():
    out = service.classify_record("Iznajmljujem garsonijeru na Trešnjevci", "heuristic")
    assert out["ai"] is False and out["kind"] == "offer" and out["category"] == "housing"
    out = service.classify_record("Trebam instrukcije iz matematike")
    assert out["kind"] == "request" and out["category"] == "gigs"
    assert service.classify_record("  ")["error"]["code"] == "empty_text"
    assert service.classify_record("x", "nope")["error"]["code"] == "invalid_provider"
