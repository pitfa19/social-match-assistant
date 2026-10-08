import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt

from . import benchmark, decisions, neighbourhood as nbh, retrieval
from .db import get_db
from .store import ImportRequest, Query, import_records

router = APIRouter(prefix="/matching", tags=["matching"])
CATALOGUE = Path(__file__).resolve().parents[3] / "shared" / "zagreb-neighbourhoods.json"


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/neighbourhoods")
def neighbourhoods():
    """Geographic availability only. Says nothing about community-source coverage."""
    if not CATALOGUE.exists():
        raise HTTPException(503, {"error": {"code": "catalogue_missing", "message": "Shared catalogue not found."}})
    d = json.loads(CATALOGUE.read_text())
    return {"counts": d.get("counts"), "provenance": d.get("provenance"), "entries": d.get("entries", []),
            "ambiguousTerms": d.get("ambiguousTerms", {}),
            "coverage_note": "Geographic availability of official areas only. It does not imply that any source "
                             "(Facebook, Reddit, user posts) has content for these areas."}


@router.post("/records/import")
def import_(req: ImportRequest, conn=Depends(get_db)):
    """Explicit records only. No ingestion from providers is performed."""
    return {"corpus": req.corpus, "result": import_records(conn, req.corpus, req.records)}


class RedditImport(BaseModel):
    """Previously returned Reddit pilot response rows (job output the caller already holds). No fetch happens here."""
    model_config = ConfigDict(extra="forbid")
    corpus: str = Field("main", pattern=r"^[a-z0-9_.-]{1,60}$")
    candidates: list[dict] = Field(min_length=1, max_length=50)


@router.post("/records/import-reddit")
def import_reddit(req: RedditImport, conn=Depends(get_db)):
    from .store import PostIn
    recs, skipped = [], 0
    for c in req.candidates:
        loc = c.get("location") or {}
        hoods = loc.get("neighbourhoods") or []
        try:
            recs.append(PostIn(
                source="reddit", record_kind="live_imported", external_id=str(c["redditId"]),
                title=str(c["title"])[:300], body=str(c.get("body", ""))[:4000],
                city=loc.get("city") if loc.get("status") == "zagreb_mention_candidate" else None,
                posted_at=c.get("posted"), url=c.get("redditUrl"),
                provenance={**(c.get("provenance") or {}), "location_status": loc.get("status"),
                            "candidate_neighbourhoods": hoods, "untrusted_content": True, "verified_live": False}))
        except Exception:
            skipped += 1
    if not recs:
        raise HTTPException(422, {"error": {"code": "no_valid_records", "message": "No importable candidates."}})
    return {"corpus": req.corpus, "result": import_records(conn, req.corpus, recs), "skipped_invalid": skipped}


class RetrieveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    corpus: str = Field("main", pattern=r"^[a-z0-9_.-]{1,60}$")
    query: Query
    mode: str = Field("indexed", pattern="^(indexed|brute)$")
    max_candidates: StrictInt = Field(100, ge=1, le=retrieval.MAX_CANDIDATES)
    now: datetime | None = None


def _clip(r, place=None):
    extra = {"neighbourhood_match": nbh.match_info(place, r["neighbourhood_basis"])} if place else {}
    return {**extra, **{**{k: r[k] for k in ("id", "external_id", "source", "record_kind", "kind", "title", "city",
                                  "neighbourhood_id", "price_eur", "url", "unknown_fields")},
            "posted_at": r["posted_at"], "expires_at": r["expires_at"], "body": r["body"][:300],
            "untrusted_content": True}}


@router.post("/retrieve")
def retrieve(req: RetrieveRequest, conn=Depends(get_db)):
    now = req.now or _now()
    strict = req.query.require_neighbourhood_evidence
    place = nbh.get_place(req.query.neighbourhood_id) if strict else None
    ev = ({"neighbourhood_evidence": {
        "required": True, "id": place["id"], "name": place["name"],
        "note": "Post text mentions the area (or structured field). Not a verified physical location."}}
        if strict else {})
    if req.mode == "brute":
        rows = retrieval.brute(conn, req.corpus, req.query, now)
        shown = rows[: req.max_candidates]
        return {"mode": "brute", "eligible": len(rows), "returned": len(shown), "truncated": len(rows) > len(shown),
                "results": [_clip(r, place) for r in shown], **ev}
    ix = retrieval.indexed(conn, req.corpus, req.query, now, req.max_candidates)
    return {"mode": "indexed", "terms": ix["terms"], "tsquery": ix["tsquery"], "returned": len(ix["candidates"]),
            "truncated": ix["truncated"], "results": [_clip(r, place) for r in ix["candidates"]],
            "note": "Lexical candidates only. Not relevance scores.", **ev}


class BenchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    corpus: str = Field(benchmark.FIXTURE_CORPUS, pattern=r"^[a-z0-9_.-]{1,60}$")
    load_fixture: StrictBool = False
    max_api_calls: StrictInt = Field(ge=1, le=benchmark.HARD_MAX_API_CALLS)
    max_candidates: StrictInt = Field(retrieval.MAX_CANDIDATES, ge=1, le=retrieval.MAX_CANDIDATES)
    now: datetime | None = None


@router.post("/benchmark/dry-run")
def bench_dry(req: BenchRequest, conn=Depends(get_db)):
    """Never calls Decisions. Paid live mode is separate: POST /matching/benchmark/live or scripts/benchmark.py --live-decisions."""
    loaded = benchmark.load_fixture(conn) if req.load_fixture and req.corpus == benchmark.FIXTURE_CORPUS else None
    now = req.now or benchmark.default_now()
    out = benchmark.dry_run(conn, req.corpus, now, req.max_api_calls, req.max_candidates)
    if loaded:
        out["fixture_loaded"] = loaded
    return out


class LiveRequest(BenchRequest):
    confirm_live: StrictBool = False
    rate_per_m_input_usd: float = Field(decisions.DEFAULT_RATE_PER_M_INPUT, ge=0, le=1000)


def get_live_transport():
    """Override in tests with httpx.MockTransport."""
    return None


@router.post("/benchmark/live")
def bench_live(req: LiveRequest, conn=Depends(get_db), transport=Depends(get_live_transport)):
    """PAID. Requires confirm_live=true, OPENAI_API_KEY in the backend environment and max_api_calls >= planned."""
    if req.load_fixture and req.corpus == benchmark.FIXTURE_CORPUS:
        benchmark.load_fixture(conn)
    try:
        return benchmark.live_run(conn, req.corpus, req.now or benchmark.default_now(), req.max_api_calls,
                                  req.rate_per_m_input_usd, max_candidates=req.max_candidates,
                                  transport=transport, confirm_live=req.confirm_live)
    except benchmark.BenchmarkError as e:
        raise HTTPException(409, {"error": {"code": e.code, "message": e.message}})
