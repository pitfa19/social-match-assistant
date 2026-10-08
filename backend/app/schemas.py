import re
from datetime import date
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator

_SLUG = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
_HOSTS = {"facebook.com", "www.facebook.com"}


def normalize_group_url(raw: str) -> str:
    """Accept only https://[www.]facebook.com/groups/{id-or-slug}. Returns canonical URL."""
    raw = raw.strip()
    if len(raw) > 300 or any(c.isspace() or ord(c) < 32 for c in raw):
        raise ValueError("invalid group URL")
    parts = urlsplit(raw)
    if parts.scheme != "https" or parts.hostname not in _HOSTS:
        raise ValueError("URL must be https://facebook.com/groups/{id-or-slug}")
    if parts.username or parts.password or parts.port or parts.query or parts.fragment:
        raise ValueError("URL must not contain credentials, port, query or fragment")
    segs = [s for s in parts.path.split("/") if s]
    if len(segs) != 2 or segs[0] != "groups" or not _SLUG.match(segs[1]) or segs[1] in {".", ".."}:
        raise ValueError("URL path must be exactly /groups/{id-or-slug}")
    return f"https://www.facebook.com/groups/{segs[1]}"


class FacebookGroupScrape(BaseModel):
    model_config = ConfigDict(extra="forbid")
    group_url: str
    max_results: StrictInt = Field(20, ge=1, le=100)
    newer_than: date | None = None

    @field_validator("group_url")
    @classmethod
    def _url(cls, v: str) -> str:
        return normalize_group_url(v)

    @field_validator("newer_than")
    @classmethod
    def _date(cls, v: date | None) -> date | None:
        if v and v > date.today():
            raise ValueError("newer_than must not be in the future")
        return v
