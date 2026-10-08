"""Brute-force vs indexed matching benchmark. dry_run makes no provider calls and reports NO scoring metrics."""
import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import psycopg
import psycopg.pq

from . import decisions, retrieval
from .store import PostIn, Query, import_records

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "benchmark_hr.json"
FIXTURE_CORPUS = "bench-fixture"
RELEVANT_AT = 1.0          # brute score >= this counts as model-relevant (model agreement, not truth)
HARD_MAX_API_CALLS = 5000
DEFAULT_CONCURRENCY = 4


class BenchmarkError(Exception):
    def __init__(self, code: str, message: str):
        self.code, self.message = code, message
        super().__init__(message)


def load_fixture(conn, path: Path = FIXTURE, corpus: str = FIXTURE_CORPUS) -> dict[str, Any]:
    data = json.loads(Path(path).read_text())
    if not data.get("synthetic"):
        raise BenchmarkError("fixture_not_synthetic", "Fixture must be explicitly marked synthetic.")
    recs = [PostIn(source="user", record_kind="synthetic", provenance={"fixture": "benchmark_hr.json", "synthetic": True},
                   **p) for p in data["posts"]]
    res = import_records(conn, corpus, recs)
    with conn.transaction():
        for q in data["queries"]:
            body = {k: v for k, v in q.items() if k != "labels"}
            conn.execute("""INSERT INTO benchmark_queries (corpus, query_id, query, labels) VALUES (%s,%s,%s::jsonb,%s::jsonb)
                            ON CONFLICT (corpus, query_id) DO UPDATE SET query=EXCLUDED.query, labels=EXCLUDED.labels""",
                         (corpus, q["id"], json.dumps(body), json.dumps(q["labels"])))
    return {"corpus": corpus, "posts": res, "queries": len(data["queries"]), "now": data["now"]}


def _queries(conn, corpus: str) -> list[tuple[Query, dict[str, int]]]:
    rows = conn.execute("SELECT query_id, query, labels FROM benchmark_queries WHERE corpus=%s ORDER BY query_id",
                        (corpus,)).fetchall()
    return [(Query(**r["query"]), r["labels"]) for r in rows]


def plan(conn, corpus: str, now: datetime, max_candidates: int = retrieval.MAX_CANDIDATES) -> dict[str, Any]:
    """Retrieval-only comparison from ONE database snapshot (REPEATABLE READ), released before any paid call.

    If the caller already holds a transaction the isolation level cannot be changed. In that case the caller's
    transaction is used as is and the snapshot guarantee is the caller's responsibility.
    """
    if conn.info.transaction_status != psycopg.pq.TransactionStatus.IDLE:
        return _plan(conn, corpus, now, max_candidates)
    with conn.transaction():
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        return _plan(conn, corpus, now, max_candidates)


def _plan(conn, corpus: str, now: datetime, max_candidates: int) -> dict[str, Any]:
    per, tot = [], {"brute_pairs": 0, "indexed_pairs": 0, "labeled_relevant": 0, "relevant_in_eligible": 0,
                    "relevant_retrieved": 0, "relevant_excluded_by_constraints": 0, "truncated_queries": 0}
    eligible_sets: dict[str, set[int]] = {}
    candidate_sets: dict[str, set[int]] = {}
    snapshot: list[dict[str, Any]] = []   # frozen once: queries, eligible rows, candidate ids
    for q, labels in _queries(conn, corpus):
        b = retrieval.brute(conn, corpus, q, now)
        ix = retrieval.indexed(conn, corpus, q, now, max_candidates)
        ext = {r["external_id"]: r for r in b}
        cand = {r["external_id"] for r in ix["candidates"]}
        snapshot.append({"q": q, "labels": labels, "rows": b, "cand_ids": {r["id"] for r in ix["candidates"]}})
        eligible_sets[q.id] = {r["id"] for r in b}
        candidate_sets[q.id] = {r["id"] for r in ix["candidates"]}
        rel = {k for k, v in labels.items() if v >= 1}
        rel_e = rel & set(ext)
        got = rel_e & cand
        per.append({"query_id": q.id, "eligible": len(b), "indexed_candidates": len(cand),
                    "indexed_truncated": ix["truncated"], "terms": ix["terms"], "tsquery": ix["tsquery"],
                    "labeled_relevant": len(rel), "relevant_eligible": len(rel_e), "relevant_retrieved": len(got),
                    "relevant_excluded_by_constraints": sorted(rel - set(ext)),
                    "missed_by_index": sorted(rel_e - cand),
                    "unknown_field_candidates": sum(1 for r in b if r["unknown_fields"])})
        tot["brute_pairs"] += len(b)
        tot["indexed_pairs"] += len(cand)
        tot["labeled_relevant"] += len(rel)
        tot["relevant_in_eligible"] += len(rel_e)
        tot["relevant_retrieved"] += len(got)
        tot["relevant_excluded_by_constraints"] += len(rel - set(ext))
        tot["truncated_queries"] += int(ix["truncated"])
    tot["retrieval_recall_vs_labels"] = (tot["relevant_retrieved"] / tot["relevant_in_eligible"]
                                         if tot["relevant_in_eligible"] else None)
    tot["indexed_pair_reduction"] = (1 - tot["indexed_pairs"] / tot["brute_pairs"]) if tot["brute_pairs"] else None
    return {"queries": per, "totals": tot, "_eligible": eligible_sets, "_candidates": candidate_sets,
            "_snapshot": snapshot}


def _public(p: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in p.items() if not k.startswith("_")}


def dry_run(conn, corpus: str, now: datetime, max_api_calls: int, max_candidates: int = retrieval.MAX_CANDIDATES,
            record: bool = True) -> dict[str, Any]:
    p = plan(conn, corpus, now, max_candidates)
    t = p["totals"]
    out = {"mode": "dry_run", "corpus": corpus,
           "planned": {"brute_force_api_calls": t["brute_pairs"],
                       "indexed_only_api_calls_if_run_independently": t["indexed_pairs"],
                       "calls_saved_by_index_vs_brute": t["brute_pairs"] - t["indexed_pairs"],
                       "max_api_calls": max_api_calls,
                       "within_limit": t["brute_pairs"] <= max_api_calls},
           "retrieval": _public(p),
           "scoring_metrics": None,
           "notice": "dry_run: no Decisions call was made. No scoring measurement of any kind "
                     "exists. Only planned comparisons and retrieval recall against labels."}
    if record:
        rid = conn.execute("INSERT INTO benchmark_runs (mode, corpus, config, summary) VALUES ('dry_run',%s,%s::jsonb,%s::jsonb) RETURNING id",
                           (corpus, json.dumps({"max_api_calls": max_api_calls, "max_candidates": max_candidates}),
                            json.dumps(out))).fetchone()["id"]
        out["run_id"] = rid
    return out


def estimate_cost(input_tokens: int, unknown_pairs: int, rate_per_m: float) -> dict[str, Any]:
    return {"kind": "estimate", "usd": round(input_tokens * rate_per_m / 1_000_000, 8),
            "rate_per_1m_input_tokens_usd": rate_per_m, "pairs_without_usage": unknown_pairs,
            "note": "Estimate from reported input tokens only. Output, cache and regional/long-context multipliers "
                    "are not included. Lower bound when pairs_without_usage > 0."}


async def _score_all(pairs, api_key, concurrency, transport, timeout):
    sem = asyncio.Semaphore(concurrency)
    async with httpx.AsyncClient(transport=transport, timeout=timeout) as client:
        async def one(q, r):
            async with sem:
                return await decisions.score_pair(client, api_key, q, r)
        return await asyncio.gather(*(one(q, r) for q, r in pairs))


def live_run(conn, corpus: str, now: datetime, max_api_calls: int, rate_per_m: float,
             api_key_env: str = "OPENAI_API_KEY", max_candidates: int = retrieval.MAX_CANDIDATES,
             concurrency: int = DEFAULT_CONCURRENCY, transport=None, confirm_live: bool = False) -> dict[str, Any]:
    """Explicit live mode. Scores brute eligible pairs once; indexed results REUSE those scores."""
    if not confirm_live:
        raise BenchmarkError("live_not_confirmed", "Live mode requires explicit confirmation.")
    if not 1 <= max_api_calls <= HARD_MAX_API_CALLS:
        raise BenchmarkError("bad_max_api_calls", f"max_api_calls must be 1..{HARD_MAX_API_CALLS}.")
    p = plan(conn, corpus, now, max_candidates)
    planned = p["totals"]["brute_pairs"]
    if planned > max_api_calls:
        raise BenchmarkError("exceeds_max_api_calls",
                             f"Planned {planned} calls exceeds max {max_api_calls}. Nothing was started and nothing truncated.")
    key = (os.getenv(api_key_env) or "").strip()
    if not key:
        raise BenchmarkError("missing_api_key", f"Environment variable {api_key_env} is not set.")
    # Everything below uses the frozen snapshot taken for the cap check. No re-query of the corpus.
    snap = p["_snapshot"]
    pairs, meta = [], []
    for e in snap:
        for r in e["rows"]:
            pairs.append((e["q"], r))
            meta.append((e["q"].id, r))
    assert len(pairs) == planned <= max_api_calls
    results = asyncio.run(_score_all(pairs, key, concurrency, transport, 60.0))
    run_id = conn.execute("INSERT INTO benchmark_runs (mode, corpus, config) VALUES ('live',%s,%s::jsonb) RETURNING id",
                          (corpus, json.dumps({"max_api_calls": max_api_calls, "model": decisions.MODEL,
                                               "rubric": decisions.RUBRIC_VERSION, "rate_per_m": rate_per_m}))
                          ).fetchone()["id"]
    scored: dict[str, dict[int, decisions.Scored]] = {}
    not_persisted = 0
    with conn.transaction():
        for (qid, r), sc_ in zip(meta, results):
            scored.setdefault(qid, {})[r["id"]] = sc_
            cur = conn.execute("""INSERT INTO benchmark_scores (run_id, query_id, post_id, outcome, score, confidence,
                              probabilities, input_tokens, output_tokens, latency_ms)
                              SELECT %s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s WHERE EXISTS (SELECT 1 FROM posts WHERE id=%s)""",
                               (run_id, qid, r["id"], sc_.outcome, sc_.score, sc_.confidence,
                                json.dumps(sc_.probabilities) if sc_.probabilities else None, sc_.input_tokens,
                                sc_.output_tokens, sc_.latency_ms, r["id"]))
            not_persisted += int(cur.rowcount == 0)
    outcomes: dict[str, int] = {}
    for sc_ in results:
        outcomes[sc_.outcome] = outcomes.get(sc_.outcome, 0) + 1
    ok = outcomes.get("ok", 0)
    rel_tot = cov_hit = 0
    t_labeled = t_ok = t_found = t_failed = 0
    for e in snap:
        q, labels, sc = e["q"], e["labels"], scored.get(e["q"].id, {})
        model_rel = {pid for pid, x in sc.items() if x.outcome == "ok" and x.score is not None and x.score >= RELEVANT_AT}
        rel_tot += len(model_rel)
        cov_hit += len(model_rel & e["cand_ids"])
        ext_to_id = {r["external_id"]: r["id"] for r in e["rows"]}
        for k, v in labels.items():
            if v >= 1 and k in ext_to_id:
                t_labeled += 1
                x = sc.get(ext_to_id[k])
                if x is not None and x.outcome == "ok":
                    t_ok += 1
                    t_found += int(x.score >= RELEVANT_AT)
                else:
                    t_failed += 1
    lat = sorted(s.latency_ms for s in results if s.latency_ms is not None)
    in_tok = sum(s.input_tokens or 0 for s in results)
    out_tok = sum(s.output_tokens or 0 for s in results)
    unknown = sum(1 for s in results if not s.usage_known)
    summary = {
        "mode": "live", "run_id": run_id, "corpus": corpus, "model": decisions.MODEL, "rubric": decisions.RUBRIC_VERSION,
        "api_calls_made": len(results), "outcomes": outcomes, "scored_ok": ok,
        "scoring_incomplete": ok < len(results),
        "planned": {k: v for k, v in _public(p)["totals"].items() if k in ("brute_pairs", "indexed_pairs")},
        "indexed_scores_reused_from_brute": True,
        "indexed_provider_latency_measured": False,
        "calls_saved_if_indexed_were_run_alone": p["totals"]["brute_pairs"] - p["totals"]["indexed_pairs"],
        "retrieval": _public(p)["totals"],
        "model_agreement": {"note": "brute model-relevant set (score >= %.1f) vs indexed candidates. NOT ground truth." % RELEVANT_AT,
                            "model_relevant_pairs": rel_tot, "covered_by_indexed_candidates": cov_hit,
                            "indexed_coverage_of_model_relevant": (cov_hit / rel_tot) if rel_tot else None},
        "truth_label_recall": {
            "note": "labeled relevant (label>=1) inside the frozen eligible set. Failed/unscored relevant are never dropped.",
            "labeled_relevant_eligible": t_labeled, "scored_ok": t_ok, "failed_or_unscored": t_failed,
            "found_by_brute": t_found,
            "recall_among_scored": (t_found / t_ok) if t_ok else None,
            "end_to_end_recall": (t_found / t_labeled) if t_labeled else None},
        "snapshot": {"frozen_before_cap_check": True, "pairs_scored_from_snapshot": len(pairs),
                     "scores_not_persisted_post_deleted": not_persisted},
        "latency_ms": {"n": len(lat), "median": lat[len(lat) // 2] if lat else None,
                       "p95": lat[min(len(lat) - 1, int(len(lat) * 0.95))] if lat else None,
                       "note": "brute pair calls only, concurrency %d" % concurrency},
        "tokens": {"input": in_tok, "output": out_tok, "pairs_without_usage": unknown},
        "cost": estimate_cost(in_tok, unknown, rate_per_m),
    }
    conn.execute("UPDATE benchmark_runs SET summary=%s::jsonb WHERE id=%s", (json.dumps(summary), run_id))
    return summary


def default_now() -> datetime:
    return datetime.fromisoformat(json.loads(FIXTURE.read_text())["now"]).astimezone(timezone.utc)
