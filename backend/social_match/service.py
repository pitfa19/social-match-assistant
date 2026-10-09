"""The five operations, as plain functions. The MCP server only wraps these.

Every function returns JSON-safe dicts, never raises for expected problems (it returns ``{"error": {...}}``),
and never makes a network call unless the caller opts in explicitly.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Any

import httpx

from . import decisions, index, places, scraper
from .models import Post, Query
from .text import fold

CORPUS_RE = r"^[a-z0-9_.-]{1,60}$"
SUITABLE_AT = 1.5
UNCERTAIN_AT = 0.5


def _err(code: str, message: str) -> dict[str, Any]:
    return {"error": {"code": code, "message": message}}


def _corpus(name: str) -> str | None:
    import re
    return name if re.fullmatch(CORPUS_RE, name or "") else None


# ------------------------------------------------------------------ 1. scrape
def scrape_source(source: str, target: str, max_results: int = 10, newer_than: str | None = None, *,
                  dry_run: bool = True, confirm_paid: bool = False, conn: sqlite3.Connection | None = None,
                  corpus: str = "main", transport: httpx.BaseTransport | None = None,
                  api_key: str | None = None) -> dict[str, Any]:
    """Plan or run one bounded Mindcase scrape. Dry run by default. Optionally index what survives normalisation."""
    try:
        plan = scraper.plan(source, target, max_results, newer_than)
        if dry_run:
            return {"mode": "dry_run", "network_call_made": False, "plan": plan.describe(),
                    "next": "Set dry_run=false, confirm_paid=true and provide MINDCASE_API_KEY to run it."}
        res = scraper.run(plan, confirm_paid=confirm_paid, api_key=api_key, transport=transport)
    except scraper.ScrapeError as e:
        return _err(e.code, e.message)
    posts, dropped = scraper.normalize_rows(plan, res["rows"], res["job_id"])
    out: dict[str, Any] = {"mode": "live", "status": res["status"], "terminal": res["terminal"],
                           "truncated": res["truncated"], "job_id": res["job_id"], "rows_received": len(res["rows"]),
                           "kept": len(posts), "dropped": dropped,
                           "records": [p.model_dump(mode="json") for p in posts],
                           "untrusted_content": True}
    if conn is not None and posts and corpus:
        if _corpus(corpus) is None:
            return _err("invalid_corpus", "corpus must match " + CORPUS_RE)
        out["indexed"] = index.add_posts(conn, corpus, [_classified(p) for p in posts])
    return out


def fetch_scrape_job(job_id: str, *, transport: httpx.BaseTransport | None = None,
                     api_key: str | None = None) -> dict[str, Any]:
    """Read an existing job's results by id. Never starts a new paid run."""
    try:
        return scraper.fetch_job(job_id, transport=transport, api_key=api_key)
    except scraper.ScrapeError as e:
        return _err(e.code, e.message)


# ------------------------------------------------------------------ 2. classify
def _classified(p: Post) -> Post:
    """Fill kind and category from offline rules when they are missing. Never overwrites a given value."""
    text = f"{p.title} {p.body}"
    updates: dict[str, Any] = {}
    if p.kind == "unknown":
        updates["kind"] = decisions.guess_kind(text)
    if not p.category:
        updates["category"] = decisions.guess_category(text)[0]
    return p.model_copy(update=updates) if updates else p


def classify_record(text: str, provider: str = "heuristic", confirm_paid: bool = False, *,
                    transport: httpx.BaseTransport | None = None, api_key: str | None = None) -> dict[str, Any]:
    """Classify one post: request/offer side and category. ``heuristic`` is offline. ``decisions`` is paid."""
    if not text or not text.strip():
        return _err("empty_text", "text must not be empty.")
    try:
        prov = decisions.get_provider(provider, confirm_paid=confirm_paid, api_key=api_key, transport=transport)
    except decisions.ProviderError as e:
        return _err(e.code, e.message)
    cat = prov.categorise(text[:1500])
    return {"provider": prov.name, "ai": prov.ai, "kind": decisions.guess_kind(text),
            "kind_basis": "croatian_cue_rules", "category": cat.category, "category_scores": cat.scores,
            "outcome": cat.outcome, "categories": decisions.CATEGORIES, "untrusted_content_treated_as_data": True}


# ------------------------------------------------------------------ 3. index
def index_records(conn: sqlite3.Connection, records: list[dict[str, Any]], corpus: str = "main",
                  classify: bool = True) -> dict[str, Any]:
    """Validate and store records. Invalid ones are reported, never silently dropped."""
    if _corpus(corpus) is None:
        return _err("invalid_corpus", "corpus must match " + CORPUS_RE)
    if not records:
        return _err("no_records", "records must not be empty.")
    good: list[Post] = []
    invalid: list[dict[str, Any]] = []
    for i, r in enumerate(records[: index.MAX_IMPORT]):
        try:
            p = Post.model_validate(r)
            good.append(_classified(p) if classify else p)
        except Exception as e:  # pydantic ValidationError, message only, no input echo
            invalid.append({"index": i, "reason": type(e).__name__})
    if len(records) > index.MAX_IMPORT:
        invalid.append({"index": index.MAX_IMPORT, "reason": f"over_limit_{index.MAX_IMPORT}"})
    result = index.add_posts(conn, corpus, good) if good else {"inserted": 0, "updated": 0, "unchanged": 0}
    return {"corpus": corpus, "result": result, "invalid": invalid, "stats": index.stats(conn, corpus)}


# ------------------------------------------------------------------ 4. search
def search_index(conn: sqlite3.Connection, query: dict[str, Any], corpus: str = "main", limit: int = 20,
                 provider: str = "heuristic", confirm_paid: bool = False, include_synthetic: bool = True,
                 now: datetime | None = None, *, transport: httpx.BaseTransport | None = None,
                 api_key: str | None = None) -> dict[str, Any]:
    """Hard constraints first (SQL), then relevance scoring on the survivors only."""
    if _corpus(corpus) is None:
        return _err("invalid_corpus", "corpus must match " + CORPUS_RE)
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 100:
        return _err("invalid_limit", "limit must be an integer from 1 to 100.")
    try:
        q = Query.model_validate(query)
        prov = decisions.get_provider(provider, confirm_paid=confirm_paid, api_key=api_key, transport=transport)
        found = index.search(conn, corpus, q, now, limit=limit, include_synthetic=include_synthetic)
    except decisions.ProviderError as e:
        return _err(e.code, e.message)
    except ValueError as e:
        return _err("invalid_query", str(e)[:200])
    except Exception as e:
        return _err("invalid_query", type(e).__name__)
    suitable, uncertain, excluded = [], [], []
    for c in found["candidates"]:
        s = prov.score(q, c)
        c = {**c, "score": s.score, "level": s.level, "confidence": s.confidence, "score_outcome": s.outcome}
        if s.outcome != "ok" or s.score is None:
            uncertain.append(c)
        elif s.score >= SUITABLE_AT:
            suitable.append(c)
        elif s.score >= UNCERTAIN_AT:
            uncertain.append(c)
        else:
            excluded.append(c)
    key = lambda c: -(c["score"] or 0)  # noqa: E731
    return {"provider": prov.name, "ai": prov.ai, "terms": found["terms"],
            "eligible_after_hard_constraints": found["eligible_lexical"], "truncated": found["truncated"],
            "suitable": sorted(suitable, key=key), "uncertain": sorted(uncertain, key=key),
            "excluded": sorted(excluded, key=key),
            "note": ("Hard constraints ran in SQL before scoring. The heuristic provider is lexical, not AI."
                     if not prov.ai else "Hard constraints ran in SQL before Decisions scoring."),
            "untrusted_content": True}


# ------------------------------------------------------------------ 5. draft
_HR = {"offer": "Nudim", "request": "Tražim"}
_EN = {"offer": "Offering", "request": "Looking for"}


def draft_post(kind: str, what: str, neighbourhood_id: str | None = None, price_eur: float | None = None,
               availability: str | None = None, details: list[str] | None = None, language: str = "hr",
               confirmed: bool = False) -> dict[str, Any]:
    """Compose a post ONLY from the facts given. Missing facts are listed, never invented. Nothing is posted."""
    if kind not in ("request", "offer"):
        return _err("invalid_kind", "kind must be 'request' or 'offer'.")
    if language not in ("hr", "en"):
        return _err("invalid_language", "language must be 'hr' or 'en'.")
    if not what or not what.strip():
        return _err("missing_what", "what must describe the item, service or need.")
    if not confirmed:
        return _err("not_confirmed", "Facts must be confirmed by the user first. Pass confirmed=true after they agree.")
    place = places.get_place(neighbourhood_id) if neighbourhood_id else None
    if neighbourhood_id and place is None:
        return _err("unknown_neighbourhood", "neighbourhood_id is not in the Zagreb catalogue.")
    hr = language == "hr"
    head = (_HR if hr else _EN)[kind]
    parts = [f"{head}: {what.strip().rstrip('.')}."]
    used = ["what"]
    if place:
        parts.append(("Lokacija: " if hr else "Location: ") + f"{place['name']}, Zagreb.")
        used.append("neighbourhood")
    if price_eur is not None:
        label = ("Cijena" if kind == "offer" else "Budžet") if hr else ("Price" if kind == "offer" else "Budget")
        parts.append(f"{label}: {price_eur:g} EUR.")
        used.append("price")
    if availability:
        parts.append(("Dostupnost: " if hr else "Availability: ") + availability.strip().rstrip(".") + ".")
        used.append("availability")
    for d in (details or [])[:6]:
        if d and d.strip():
            parts.append(d.strip().rstrip(".") + ".")
            used.append("detail")
    missing = [f for f, v in (("neighbourhood", place), ("price", price_eur), ("availability", availability)) if not v and v != 0]
    parts.append("Javite se u poruci." if hr else "Message me to get in touch.")
    return {"language": language, "draft": "\n".join(parts), "used_facts": used, "missing_fields": missing,
            "posted": False, "note": "Draft only. The user reviews, edits and publishes it themselves."}


def stats(conn: sqlite3.Connection, corpus: str | None = None) -> dict[str, Any]:
    return index.stats(conn, corpus)


def list_sources() -> dict[str, Any]:
    """Owner's source directory. Listing a URL never starts or authorises collection."""
    import json
    from pathlib import Path
    f = Path(__file__).resolve().parents[2] / "shared" / "community-sources.json"
    data = json.loads(f.read_text())
    return {"sources": [{k: s[k] for k in ("id", "platform", "name", "scope", "neighbourhood_ids", "status")}
                        for s in data["sources"]],
            "note": "Registry only. Listed sources are unverified and nothing here authorises scraping."}


__all__ = ["scrape_source", "fetch_scrape_job", "classify_record", "index_records", "search_index", "draft_post",
           "stats", "list_sources", "fold"]


def load_fixture(conn: sqlite3.Connection, path: str | None = None, corpus: str = "demo") -> dict[str, Any]:
    """Load the synthetic Croatian fixture into a corpus. Records are labelled ``synthetic``."""
    import json
    from pathlib import Path
    f = Path(path) if path else Path(__file__).resolve().parents[1] / "fixtures" / "synthetic_hr.json"
    data = json.loads(f.read_text())
    if not data.get("synthetic"):
        return _err("fixture_not_synthetic", "Fixture must be explicitly marked synthetic.")
    recs = [{"source": "user", "record_kind": "synthetic", "provenance": {"fixture": f.name, "synthetic": True}, **p}
            for p in data["posts"]]
    return index_records(conn, recs, corpus, classify=True)
