"""Import/normalise records into PostgreSQL and the SINGLE hard-constraint eligibility definition."""
import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator

from .text import fold

MAX_IMPORT = 500
Source = Literal["reddit", "facebook", "user"]
RecordKind = Literal["synthetic", "live_imported", "user_contributed"]


class PostIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: Source
    record_kind: RecordKind
    external_id: str = Field(min_length=1, max_length=200)
    kind: Literal["request", "offer", "unknown"] = "unknown"
    title: str = Field(min_length=1, max_length=300)
    body: str = Field("", max_length=4000)
    city: str | None = Field(None, max_length=80)
    neighbourhood_id: str | None = Field(None, max_length=100)   # catalogue ids are strings
    price_eur: float | None = Field(None, ge=0, le=10_000_000)
    posted_at: datetime | None = None
    expires_at: datetime | None = None
    url: str | None = Field(None, max_length=400)
    provenance: dict[str, Any] = Field(default_factory=dict)

    @field_validator("posted_at", "expires_at")
    @classmethod
    def _aware(cls, v):
        return v if v is None or v.tzinfo else v.replace(tzinfo=timezone.utc)


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    corpus: str = Field("main", pattern=r"^[a-z0-9_.-]{1,60}$")
    records: list[PostIn] = Field(min_length=1, max_length=MAX_IMPORT)


def _hash(p: PostIn) -> str:
    return hashlib.sha256(json.dumps(p.model_dump(mode="json"), sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def import_records(conn, corpus: str, records: list[PostIn]) -> dict[str, int]:
    ins = upd = same = 0
    with conn.transaction():
        for p in records:
            h = _hash(p)
            folded = fold(f"{p.title} {p.body}")
            city_key = fold(p.city).strip() if p.city else None
            row = conn.execute(
                """INSERT INTO posts (corpus, source, record_kind, external_id, kind, title, body, text_folded,
                     city, city_key, neighbourhood_id, price_eur, posted_at, expires_at, url, provenance, content_hash)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s)
                   ON CONFLICT (corpus, source, external_id) DO UPDATE SET
                     record_kind=EXCLUDED.record_kind, kind=EXCLUDED.kind, title=EXCLUDED.title, body=EXCLUDED.body,
                     text_folded=EXCLUDED.text_folded, city=EXCLUDED.city, city_key=EXCLUDED.city_key,
                     neighbourhood_id=EXCLUDED.neighbourhood_id, price_eur=EXCLUDED.price_eur,
                     posted_at=EXCLUDED.posted_at, expires_at=EXCLUDED.expires_at, url=EXCLUDED.url,
                     provenance=EXCLUDED.provenance, content_hash=EXCLUDED.content_hash, imported_at=now()
                   WHERE posts.content_hash <> EXCLUDED.content_hash
                   RETURNING (xmax = 0) AS inserted""",
                (corpus, p.source, p.record_kind, p.external_id, p.kind, p.title, p.body, folded, p.city, city_key,
                 p.neighbourhood_id, p.price_eur, p.posted_at, p.expires_at, p.url, json.dumps(p.provenance), h),
            ).fetchone()
            if row is None:
                same += 1
            elif row["inserted"]:
                ins += 1
            else:
                upd += 1
    return {"inserted": ins, "updated": upd, "unchanged": same}


class Query(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = "q"
    kind: Literal["request", "offer"]
    text: str = Field(min_length=1, max_length=1000)
    city: str | None = None
    neighbourhood_id: str | None = None
    max_price_eur: float | None = Field(None, ge=0)
    # Opt-in. Unknown location is excluded unless the stored text names the selected catalogue area (or it is structured).
    require_neighbourhood_evidence: StrictBool = False

    @model_validator(mode="after")
    def _strict_needs_area(self):
        if self.require_neighbourhood_evidence:
            from .neighbourhood import get_place
            if not self.neighbourhood_id or get_place(self.neighbourhood_id) is None:
                raise ValueError("require_neighbourhood_evidence needs a catalogue neighbourhood_id")
        return self


OPPOSITE = {"request": "offer", "offer": "request"}

# Shared by brute and indexed paths. Hard constraints reject only KNOWN mismatches.
# Unknown values never become mismatches: they are reported in unknown_fields instead.
ELIGIBLE_SQL = """
SELECT p.id, p.external_id, p.source, p.record_kind, p.kind, p.title, p.body, p.city, p.neighbourhood_id,
       p.price_eur, p.posted_at, p.expires_at, p.url,
       array_remove(ARRAY[
         CASE WHEN p.kind = 'unknown' THEN 'kind' END,
         CASE WHEN %(city)s::text IS NOT NULL AND p.city_key IS NULL THEN 'city' END,
         CASE WHEN %(nb)s::text IS NOT NULL AND p.neighbourhood_id IS NULL THEN 'neighbourhood' END,
         CASE WHEN %(max_price)s::numeric IS NOT NULL AND p.price_eur IS NULL THEN 'price' END,
         CASE WHEN p.expires_at IS NULL THEN 'expiry' END
       ], NULL) AS unknown_fields
  {extra_select}
  FROM posts p
 WHERE p.corpus = %(corpus)s
   AND p.kind IN (%(opposite)s, 'unknown')
   AND (p.expires_at IS NULL OR p.expires_at > %(now)s)
   AND (%(city)s::text IS NULL OR p.city_key IS NULL OR p.city_key = %(city)s)
   AND (%(nb)s::text IS NULL OR p.neighbourhood_id IS NULL OR p.neighbourhood_id = %(nb)s)
   AND (%(max_price)s::numeric IS NULL OR p.price_eur IS NULL OR p.price_eur <= %(max_price)s)
   {extra_where}
 {order_limit}
"""


def params(corpus: str, q: Query, now: datetime) -> dict[str, Any]:
    return {"corpus": corpus, "opposite": OPPOSITE[q.kind], "now": now,
            "city": fold(q.city).strip() if q.city else None, "nb": q.neighbourhood_id,
            "max_price": q.max_price_eur}
