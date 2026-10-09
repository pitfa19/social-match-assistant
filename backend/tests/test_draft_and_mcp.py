import asyncio
import json

from social_match import mcp_server, service


def test_draft_requires_confirmation_and_never_invents():
    assert service.draft_post("offer", "bicikl")["error"]["code"] == "not_confirmed"
    d = service.draft_post("offer", "Gorski bicikl", "mo-jarun", 180, confirmed=True)
    assert "Jarun" in d["draft"] and "180 EUR" in d["draft"] and d["posted"] is False
    assert d["missing_fields"] == ["availability"]
    e = service.draft_post("request", "sofa", language="en", confirmed=True)
    assert e["draft"].startswith("Looking for: sofa.") and set(e["missing_fields"]) == {"neighbourhood", "price", "availability"}
    assert service.draft_post("offer", "x", "nowhere", confirmed=True)["error"]["code"] == "unknown_neighbourhood"


def test_index_reports_invalid_records(conn):
    out = service.index_records(conn, [{"source": "user", "record_kind": "user_contributed", "external_id": "1", "title": "ok"},
                                       {"source": "tiktok", "record_kind": "x"}])
    assert out["result"]["inserted"] == 1 and len(out["invalid"]) == 1
    assert service.index_records(conn, [], "main")["error"]["code"] == "no_records"
    assert service.index_records(conn, [{}], "BAD NAME")["error"]["code"] == "invalid_corpus"


def test_mcp_server_exposes_the_five_tools_and_resources():
    tools = {t.name: t for t in asyncio.run(mcp_server.mcp.list_tools())}
    assert {"scrape_source", "classify_record", "index_records", "search_index", "draft_post"} <= set(tools)
    assert tools["scrape_source"].inputSchema["properties"]["dry_run"]["default"] is True
    assert tools["search_index"].inputSchema["properties"]["provider"]["default"] == "heuristic"
    uris = {str(r.uri) for r in asyncio.run(mcp_server.mcp.list_resources())}
    assert {"social-match://index/stats", "social-match://sources"} <= uris


def test_mcp_call_roundtrip_dry_run(tmp_path, monkeypatch):
    monkeypatch.setenv("SOCIAL_MATCH_DB", str(tmp_path / "i.db"))
    mcp_server._conn = None
    res = asyncio.run(mcp_server.mcp.call_tool("scrape_source", {"source": "reddit", "target": "zagreb", "max_results": 5}))
    text = json.dumps([getattr(c, "text", str(c)) for c in (res[0] if isinstance(res, tuple) else res)])
    assert "dry_run" in text and "estimated_cost_usd" in text
    mcp_server._conn = None
