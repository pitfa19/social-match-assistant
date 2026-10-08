from datetime import datetime
from typing import Any

from .store import ELIGIBLE_SQL, Query, params
from .text import build_tsquery

MAX_CANDIDATES = 500


def brute(conn, corpus: str, q: Query, now: datetime) -> list[dict[str, Any]]:
    """Every eligible post (exact corpus after hard constraints). No lexical filter."""
    sql = ELIGIBLE_SQL.format(extra_select="", extra_where="", order_limit="ORDER BY p.id")
    return conn.execute(sql, params(corpus, q, now)).fetchall()


def indexed(conn, corpus: str, q: Query, now: datetime, max_candidates: int = MAX_CANDIDATES) -> dict[str, Any]:
    """GIN-backed lexical candidates inside the same eligible set. Truncation is reported, never silent."""
    tsq, terms = build_tsquery(q.text)
    if tsq is None:
        return {"candidates": [], "terms": terms, "tsquery": None, "matched": 0, "truncated": False,
                "note": "query has no searchable terms"}
    p = params(corpus, q, now)
    p.update(tsq=tsq, lim=max_candidates + 1)
    sql = ELIGIBLE_SQL.format(
        extra_select=", ts_rank_cd(p.search, to_tsquery('simple', %(tsq)s)) AS lexical_rank",
        extra_where="AND p.search @@ to_tsquery('simple', %(tsq)s)",
        order_limit="ORDER BY lexical_rank DESC, p.id LIMIT %(lim)s")
    rows = conn.execute(sql, p).fetchall()
    truncated = len(rows) > max_candidates
    return {"candidates": rows[:max_candidates], "terms": terms, "tsquery": tsq,
            "matched": len(rows) if not truncated else None, "truncated": truncated}
