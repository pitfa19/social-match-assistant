"""SQLite + FTS5 index. One file, no server. Hard constraints run in SQL BEFORE any scoring.

Eligibility rule (single definition): a candidate must be the opposite side of the query (or unknown side),
not expired, and must not contradict a KNOWN city, neighbourhood or price. Unknown values never exclude a post,
they are reported in ``unknown_fields``.
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import places
from .models import OPPOSITE, Post, Query
from .text import fold, fts_query

MAX_IMPORT = 500
MAX_CANDIDATES = 200

SCHEMA = """
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY,
  corpus TEXT NOT NULL, source TEXT NOT NULL, record_kind TEXT NOT NULL, external_id TEXT NOT NULL,
  kind TEXT NOT NULL, category TEXT, title TEXT NOT NULL, body TEXT NOT NULL, text_folded TEXT NOT NULL,
  city TEXT, city_key TEXT, neighbourhood_id TEXT, price_eur REAL, posted_at TEXT, expires_at TEXT, url TEXT,
  provenance TEXT NOT NULL, content_hash TEXT NOT NULL, imported_at TEXT NOT NULL,
  UNIQUE (corpus, source, external_id)
);
CREATE INDEX IF NOT EXISTS posts_corpus_kind ON posts (corpus, kind);
CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(text_folded, content='posts', content_rowid='id', tokenize='unicode61');
CREATE TRIGGER IF NOT EXISTS posts_ai AFTER INSERT ON posts BEGIN
  INSERT INTO posts_fts(rowid, text_folded) VALUES (new.id, new.text_folded);
END;
CREATE TRIGGER IF NOT EXISTS posts_ad AFTER DELETE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, text_folded) VALUES ('delete', old.id, old.text_folded);
END;
CREATE TRIGGER IF NOT EXISTS posts_au AFTER UPDATE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, text_folded) VALUES ('delete', old.id, old.text_folded);
  INSERT INTO posts_fts(rowid, text_folded) VALUES (new.id, new.text_folded);
END;
"""


def default_path() -> str:
    env = os.getenv("SOCIAL_MATCH_DB")
    if env:
        return env
    return str(Path.home() / ".local" / "share" / "social-match" / "index.db")


def connect(path: str | None = None) -> sqlite3.Connection:
    p = path or default_path()
    if p != ":memory:":
        Path(p).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(p)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def _hash(post: Post) -> str:
    return hashlib.sha256(json.dumps(post.model_dump(mode="json"), sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _iso(d: datetime | None) -> str | None:
    return d.astimezone(timezone.utc).isoformat() if d else None


def add_posts(conn: sqlite3.Connection, corpus: str, posts: list[Post]) -> dict[str, int]:
    if len(posts) > MAX_IMPORT:
        raise ValueError(f"at most {MAX_IMPORT} records per call")
    ins = upd = same = 0
    now = datetime.now(timezone.utc).isoformat()
    with conn:
        for p in posts:
            h = _hash(p)
            row = conn.execute("SELECT id, content_hash FROM posts WHERE corpus=? AND source=? AND external_id=?",
                               (corpus, p.source, p.external_id)).fetchone()
            vals = (p.record_kind, p.kind, p.category, p.title, p.body, fold(f"{p.title} {p.body}"), p.city,
                    fold(p.city).strip() if p.city else None, p.neighbourhood_id, p.price_eur, _iso(p.posted_at),
                    _iso(p.expires_at), p.url, json.dumps(p.provenance, ensure_ascii=False), h, now)
            if row is None:
                conn.execute("""INSERT INTO posts (record_kind, kind, category, title, body, text_folded, city, city_key,
                    neighbourhood_id, price_eur, posted_at, expires_at, url, provenance, content_hash, imported_at,
                    corpus, source, external_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                             vals + (corpus, p.source, p.external_id))
                ins += 1
            elif row["content_hash"] != h:
                conn.execute("""UPDATE posts SET record_kind=?, kind=?, category=?, title=?, body=?, text_folded=?, city=?,
                    city_key=?, neighbourhood_id=?, price_eur=?, posted_at=?, expires_at=?, url=?, provenance=?,
                    content_hash=?, imported_at=? WHERE id=?""", vals + (row["id"],))
                upd += 1
            else:
                same += 1
    return {"inserted": ins, "updated": upd, "unchanged": same}


def stats(conn: sqlite3.Connection, corpus: str | None = None) -> dict[str, Any]:
    where, args = ("WHERE corpus=?", (corpus,)) if corpus else ("", ())
    total = conn.execute(f"SELECT COUNT(*) FROM posts {where}", args).fetchone()[0]
    by = lambda col: {r[0] or "unknown": r[1] for r in conn.execute(  # noqa: E731
        f"SELECT {col}, COUNT(*) FROM posts {where} GROUP BY {col}", args)}
    return {"total": total, "by_source": by("source"), "by_record_kind": by("record_kind"), "by_kind": by("kind"),
            "by_category": by("category"), "corpora": [r[0] for r in conn.execute("SELECT DISTINCT corpus FROM posts")]}


def _unknown(row: sqlite3.Row, q: Query) -> list[str]:
    out = []
    if row["kind"] == "unknown":
        out.append("kind")
    if q.city and row["city_key"] is None:
        out.append("city")
    if q.neighbourhood_id and row["neighbourhood_id"] is None:
        out.append("neighbourhood")
    if q.max_price_eur is not None and row["price_eur"] is None:
        out.append("price")
    if row["expires_at"] is None:
        out.append("expiry")
    return out


def search(conn: sqlite3.Connection, corpus: str, q: Query, now: datetime | None = None,
           limit: int = 50, include_synthetic: bool = True) -> dict[str, Any]:
    """Hard constraints in SQL, lexical candidates from FTS5. Truncation is reported, never silent."""
    now = now or datetime.now(timezone.utc)
    place = None
    if q.require_neighbourhood_evidence:
        place = places.get_place(q.neighbourhood_id) if q.neighbourhood_id else None
        if place is None:
            raise ValueError("require_neighbourhood_evidence needs a known catalogue neighbourhood_id")
    fts, terms = fts_query(places.strip_location_terms(q.text, place) if place else q.text)
    if fts is None:
        return {"candidates": [], "terms": terms, "eligible_lexical": 0, "truncated": False,
                "note": "query has no searchable terms"}
    sql = ["""SELECT p.*, bm25(posts_fts) AS lexical_rank FROM posts_fts JOIN posts p ON p.id = posts_fts.rowid
              WHERE posts_fts MATCH ? AND p.corpus = ? AND p.kind IN (?, 'unknown')
              AND (p.expires_at IS NULL OR p.expires_at > ?)"""]
    args: list[Any] = [fts, corpus, OPPOSITE[q.kind], now.astimezone(timezone.utc).isoformat()]
    if q.city:
        sql.append("AND (p.city_key IS NULL OR p.city_key = ?)")
        args.append(fold(q.city).strip())
    if q.neighbourhood_id:
        sql.append("AND (p.neighbourhood_id IS NULL OR p.neighbourhood_id = ?)")
        args.append(q.neighbourhood_id)
    if q.max_price_eur is not None:
        sql.append("AND (p.price_eur IS NULL OR p.price_eur <= ?)")
        args.append(q.max_price_eur)
    if not include_synthetic or place:
        sql.append("AND p.record_kind <> 'synthetic'")
    sql.append("ORDER BY lexical_rank, p.id")
    rows = conn.execute(" ".join(sql), args).fetchall()
    out = []
    for r in rows:
        basis = None
        if place:
            basis = "structured" if r["neighbourhood_id"] == place["id"] else (
                "explicit_text" if places.has_evidence(place, r["text_folded"]) else None)
            if basis is None:
                continue
        out.append(public_row(r, q, basis, place))
    cap = min(limit, MAX_CANDIDATES)
    return {"candidates": out[:cap], "terms": terms, "eligible_lexical": len(out), "truncated": len(out) > cap}


def public_row(row: sqlite3.Row, q: Query, basis: str | None = None, place: dict[str, Any] | None = None) -> dict[str, Any]:
    d = {"id": row["id"], "external_id": row["external_id"], "source": row["source"], "record_kind": row["record_kind"],
         "kind": row["kind"], "category": row["category"], "title": row["title"], "body": row["body"][:400],
         "city": row["city"], "neighbourhood_id": row["neighbourhood_id"], "price_eur": row["price_eur"],
         "posted_at": row["posted_at"], "expires_at": row["expires_at"], "url": row["url"],
         "unknown_fields": _unknown(row, q), "untrusted_content": True}
    if place and basis:
        d["neighbourhood_match"] = places.match_info(place, basis)
    return d
