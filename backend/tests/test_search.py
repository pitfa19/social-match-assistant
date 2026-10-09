import pytest

from social_match import service


def q(**kw):
    return {"kind": "request", "text": "Tražim stan u najam", "city": "Zagreb", **kw}


def titles(res, bucket):
    return [c["title"] for c in res[bucket]]


def test_fixture_loads_labelled_synthetic(demo):
    s = service.stats(demo, "demo")
    assert s["total"] == 18 and s["by_record_kind"] == {"synthetic": 18}


def test_search_returns_only_opposite_side_and_hard_constraints_first(demo):
    res = service.search_index(demo, q(max_price_eur=500), corpus="demo")
    every = res["suitable"] + res["uncertain"] + res["excluded"]
    assert every and all(c["kind"] in ("offer", "unknown") for c in every)
    assert all(c["price_eur"] is None or c["price_eur"] <= 500 for c in every)
    assert all(c["city"] in (None, "Zagreb") for c in every)
    assert res["ai"] is False and res["eligible_after_hard_constraints"] >= 1


def test_known_other_city_is_excluded_unknown_is_kept(demo):
    res = service.search_index(demo, q(), corpus="demo")
    every = res["suitable"] + res["uncertain"] + res["excluded"]
    assert not any(c["city"] == "Split" for c in every)
    assert any(c["city"] is None and "city" in c["unknown_fields"] for c in every)


def test_neighbourhood_filter(demo):
    res = service.search_index(demo, q(text="garsonijera", neighbourhood_id="tresnjevka"), corpus="demo")
    every = res["suitable"] + res["uncertain"] + res["excluded"]
    assert every and all(c["neighbourhood_id"] in (None, "tresnjevka") for c in every)


def test_strict_evidence_never_serves_synthetic(demo):
    res = service.search_index(demo, q(text="garsonijera", neighbourhood_id="tresnjevka",
                                       require_neighbourhood_evidence=True), corpus="demo")
    assert not (res["suitable"] + res["uncertain"] + res["excluded"])


def test_strict_evidence_matches_live_text_only_with_area_name(conn):
    recs = [
        {"source": "reddit", "record_kind": "live_imported", "external_id": "a", "kind": "offer",
         "title": "Iznajmljujem garsonijeru", "body": "Mirna garsonijera, Trešnjevka, 400 eura"},
        {"source": "reddit", "record_kind": "live_imported", "external_id": "b", "kind": "offer",
         "title": "Iznajmljujem garsonijeru", "body": "Mirna garsonijera, lokacija na upit"}]
    service.index_records(conn, recs)
    res = service.search_index(conn, q(text="garsonijera", neighbourhood_id="tresnjevka",
                                       require_neighbourhood_evidence=True))
    got = res["suitable"] + res["uncertain"] + res["excluded"]
    assert [c["external_id"] for c in got] == ["a"]
    assert got[0]["neighbourhood_match"]["basis"] == "explicit_text"


def test_same_side_posts_are_not_returned(demo):
    res = service.search_index(demo, {"kind": "offer", "text": "stan najam"}, corpus="demo")
    assert all(c["kind"] in ("request", "unknown") for c in res["suitable"] + res["uncertain"] + res["excluded"])


def test_croatian_inflection_and_synonyms(demo):
    res = service.search_index(demo, {"kind": "request", "text": "Trebam kauč"}, corpus="demo")
    assert any("kauč" in c["title"].lower() for c in res["suitable"])


def test_paid_provider_fails_closed(demo, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert service.search_index(demo, q(), corpus="demo", provider="decisions", confirm_paid=True)["error"]["code"] == "not_configured"
    out = service.search_index(demo, q(), corpus="demo", provider="decisions", api_key="k" * 12)
    assert out["error"]["code"] == "confirmation_required"


@pytest.mark.parametrize("bad", [{}, {"kind": "x", "text": "a"}, {"kind": "request", "text": ""},
                                 {"kind": "request", "text": "a", "extra": 1},
                                 {"kind": "request", "text": "a", "require_neighbourhood_evidence": True}])
def test_invalid_queries_return_errors(demo, bad):
    assert service.search_index(demo, bad, corpus="demo")["error"]["code"] == "invalid_query"


def test_expired_posts_are_excluded(conn):
    service.index_records(conn, [{"source": "user", "record_kind": "user_contributed", "external_id": "e", "kind": "offer",
                                  "title": "Stan u najam", "expires_at": "2020-01-01T00:00:00Z"}])
    res = service.search_index(conn, {"kind": "request", "text": "stan"})
    assert not (res["suitable"] + res["uncertain"] + res["excluded"])


def test_reindex_is_idempotent_and_updates(conn):
    rec = {"source": "user", "record_kind": "user_contributed", "external_id": "z", "kind": "offer", "title": "Bicikl"}
    assert service.index_records(conn, [rec])["result"]["inserted"] == 1
    assert service.index_records(conn, [rec])["result"]["unchanged"] == 1
    assert service.index_records(conn, [{**rec, "title": "Bicikl gorski"}])["result"]["updated"] == 1
    assert service.search_index(conn, {"kind": "request", "text": "gorski bicikl"})["suitable"]
