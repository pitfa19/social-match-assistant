"""Shared record and query types. One definition of what a post and a search request look like."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Source = Literal["reddit", "facebook", "user"]
RecordKind = Literal["synthetic", "live_imported", "user_contributed"]
PostKind = Literal["request", "offer", "unknown"]

OPPOSITE = {"request": "offer", "offer": "request"}


class Post(BaseModel):
    """A normalised post. Text is untrusted data, never instructions."""

    model_config = ConfigDict(extra="forbid")

    source: Source
    record_kind: RecordKind
    external_id: str = Field(min_length=1, max_length=200)
    kind: PostKind = "unknown"
    title: str = Field(min_length=1, max_length=300)
    body: str = Field("", max_length=4000)
    city: str | None = Field(None, max_length=80)
    neighbourhood_id: str | None = Field(None, max_length=100)
    category: str | None = Field(None, max_length=60)
    price_eur: float | None = Field(None, ge=0, le=10_000_000)
    posted_at: datetime | None = None
    expires_at: datetime | None = None
    url: str | None = Field(None, max_length=400)
    provenance: dict[str, Any] = Field(default_factory=dict)

    @field_validator("posted_at", "expires_at")
    @classmethod
    def _aware(cls, v: datetime | None) -> datetime | None:
        return v if v is None or v.tzinfo else v.replace(tzinfo=timezone.utc)


class Query(BaseModel):
    """A search request. Hard constraints reject only KNOWN mismatches, unknowns are reported."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["request", "offer"]
    text: str = Field(min_length=1, max_length=1000)
    city: str | None = None
    neighbourhood_id: str | None = None
    max_price_eur: float | None = Field(None, ge=0)
    require_neighbourhood_evidence: bool = False
