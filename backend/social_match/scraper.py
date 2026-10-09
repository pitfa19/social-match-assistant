"""Mindcase scraper: Facebook groups and the two Zagreb subreddits.

Safe by default:
- ``dry_run`` is the default. A dry run builds the exact request and estimates cost, no network call.
- A live call needs ``MINDCASE_API_KEY`` and an explicit ``confirm_paid=True``. Without them it fails closed.
- Exactly one POST per run. It is never retried, because a retry could be billed twice.
- Provider free text is withheld and the key is redacted. Rows are untrusted data.
The request contract follows the Mindcase public docs and is **not verified live**.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from urllib.parse import urlsplit

import httpx

from .models import Post

BASE_URL = "https://api.mindcase.co/v1"
TERMINAL = {"completed", "failed", "cancelled", "rejected_balance"}
USD_PER_ROW = 0.005  # public schema price, an estimate only
MAX_ROWS = 100
SUBREDDITS = ("zagreb", "askcroatia")
FACEBOOK_PATH = "/data/facebook/posts/run"
REDDIT_PATH = "/data/reddit/posts/run"

_SLUG = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
_FB_HOSTS = {"facebook.com", "www.facebook.com"}
_REDDIT_POST = re.compile(r"^/r/([A-Za-z0-9_]{1,30})/comments/([a-z0-9]{1,12})(?:/[^/\s]{0,200})?/?$")
_REDDIT_HOSTS = {"reddit.com", "www.reddit.com", "old.reddit.com"}
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_EMAIL = re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b")
_PHONE = re.compile(r"(?<!\w)(?:\+\d[\d ()/.-]{7,}\d|0\d[\d ()/.-]{7,}\d)(?!\w)")
_MSG_KEYS = {"error", "errors", "message", "notice", "detail", "reason", "warning"}


class ScrapeError(Exception):
    """Sanitised error. Never carries provider text or headers."""

    def __init__(self, code: str, message: str):
        self.code, self.message = code, message
        super().__init__(message)


def normalize_group_url(raw: str) -> str:
    """Accept only https://[www.]facebook.com/groups/{id-or-slug}."""
    raw = raw.strip()
    if len(raw) > 300 or any(c.isspace() or ord(c) < 32 for c in raw):
        raise ScrapeError("invalid_target", "Invalid group URL.")
    p = urlsplit(raw)
    if p.scheme != "https" or p.hostname not in _FB_HOSTS:
        raise ScrapeError("invalid_target", "URL must be https://facebook.com/groups/{id-or-slug}.")
    if p.username or p.password or p.port or p.query or p.fragment:
        raise ScrapeError("invalid_target", "URL must not contain credentials, port, query or fragment.")
    segs = [s for s in p.path.split("/") if s]
    if len(segs) != 2 or segs[0] != "groups" or not _SLUG.match(segs[1]) or segs[1] in {".", ".."}:
        raise ScrapeError("invalid_target", "URL path must be exactly /groups/{id-or-slug}.")
    return f"https://www.facebook.com/groups/{segs[1]}"


def normalize_subreddit(raw: str) -> str:
    v = raw.strip().lower().removeprefix("r/")
    if v not in SUBREDDITS:
        raise ScrapeError("invalid_target", "Subreddit must be one of: " + ", ".join(SUBREDDITS) + ".")
    return v


@dataclass(frozen=True)
class ScrapePlan:
    source: Literal["facebook", "reddit"]
    target: str
    path: str
    params: dict[str, Any]
    max_results: int

    @property
    def estimated_cost_usd(self) -> float:
        return round(self.max_results * USD_PER_ROW, 4)

    def describe(self) -> dict[str, Any]:
        return {"source": self.source, "target": self.target, "method": "POST", "path": self.path + "?wait=true",
                "body": {"params": self.params}, "max_results": self.max_results,
                "estimated_cost_usd": self.estimated_cost_usd, "cost_note": "Estimate from public schema, not a quote."}


def plan(source: str, target: str, max_results: int, newer_than: str | None = None) -> ScrapePlan:
    if isinstance(max_results, bool) or not isinstance(max_results, int) or not 1 <= max_results <= MAX_ROWS:
        raise ScrapeError("invalid_limit", f"max_results must be an integer from 1 to {MAX_ROWS}.")
    if source == "facebook":
        params: dict[str, Any] = {"groupUrls": normalize_group_url(target), "maxResults": max_results}
        if newer_than:
            params["onlyPostsNewerThan"] = _date(newer_than)
        return ScrapePlan("facebook", params["groupUrls"], FACEBOOK_PATH, params, max_results)
    if source == "reddit":
        sub = normalize_subreddit(target)
        return ScrapePlan("reddit", f"r/{sub}", REDDIT_PATH,
                          {"urls": f"https://www.reddit.com/r/{sub}/", "maxResults": max_results, "sortBy": "new"},
                          max_results)
    raise ScrapeError("invalid_source", "source must be 'facebook' or 'reddit'.")


def _date(v: str) -> str:
    try:
        d = datetime.fromisoformat(v).date()
    except ValueError:
        raise ScrapeError("invalid_date", "newer_than must be YYYY-MM-DD.") from None
    if d > datetime.now(timezone.utc).date():
        raise ScrapeError("invalid_date", "newer_than must not be in the future.")
    return d.isoformat()


# ---------- provider call ----------
def _sanitize(value: Any, key: str | None, secret: str | None) -> Any:
    if isinstance(value, dict):
        return {k: _sanitize(v, k, secret) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize(v, key, secret) for v in value]
    if isinstance(value, str):
        if key and key.lower() in _MSG_KEYS:
            return "[provider message withheld]"
        if secret and secret in value:
            return value.replace(secret, "[redacted]")
    return value


def _error_for(status: int) -> ScrapeError:
    if status in (401, 403):
        return ScrapeError("provider_auth", "Provider rejected the credentials.")
    if status == 402:
        return ScrapeError("provider_balance", "Provider balance is insufficient.")
    if status == 429:
        return ScrapeError("provider_rate_limited", "Provider rate limit reached. Try later.")
    if status >= 500:
        return ScrapeError("provider_unavailable", "Provider failed. Not retried to avoid duplicate cost.")
    return ScrapeError("provider_rejected", "Provider rejected the request.")


def _request(method: str, path: str, *, api_key: str, base_url: str, transport: httpx.BaseTransport | None,
             timeout: float, **kw: Any) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}
    try:
        with httpx.Client(base_url=base_url, timeout=timeout, transport=transport, follow_redirects=False) as c:
            r = c.request(method, path, headers=headers, **kw)
    except httpx.TimeoutException:
        raise ScrapeError("provider_timeout", "Provider timed out. The job may still run, fetch it by job_id later.") from None
    except httpx.HTTPError:
        raise ScrapeError("provider_unreachable", "Could not reach provider.") from None
    if r.status_code >= 300:
        raise _error_for(r.status_code)
    try:
        body = r.json()
    except ValueError:
        raise ScrapeError("provider_bad_response", "Provider returned non-JSON.") from None
    if not isinstance(body, dict):
        raise ScrapeError("provider_bad_response", "Provider returned unexpected JSON.")
    return body


def run(p: ScrapePlan, *, confirm_paid: bool, api_key: str | None = None, base_url: str | None = None,
        transport: httpx.BaseTransport | None = None, timeout: float = 120.0) -> dict[str, Any]:
    """Execute one paid run. Fails closed without a key or explicit confirmation."""
    key = api_key if api_key is not None else (os.getenv("MINDCASE_API_KEY") or "").strip() or None
    if not key:
        raise ScrapeError("not_configured", "MINDCASE_API_KEY is not set. Nothing was sent.")
    if not confirm_paid:
        raise ScrapeError("confirmation_required", "Live scraping is billed. Pass confirm_paid=true. Nothing was sent.")
    base = (base_url or os.getenv("MINDCASE_BASE_URL") or BASE_URL).rstrip("/")
    body = _request("POST", p.path, api_key=key, base_url=base, transport=transport, timeout=timeout,
                    params={"wait": "true"}, json={"params": p.params})
    return _summarise(body, key)


def fetch_job(job_id: str, *, api_key: str | None = None, base_url: str | None = None,
              transport: httpx.BaseTransport | None = None, timeout: float = 60.0) -> dict[str, Any]:
    """Read an existing job. Never starts a new paid run."""
    if not re.fullmatch(r"[A-Za-z0-9-]{8,64}", job_id):
        raise ScrapeError("invalid_job", "job_id has an unexpected shape.")
    key = api_key if api_key is not None else (os.getenv("MINDCASE_API_KEY") or "").strip() or None
    if not key:
        raise ScrapeError("not_configured", "MINDCASE_API_KEY is not set. Nothing was sent.")
    base = (base_url or os.getenv("MINDCASE_BASE_URL") or BASE_URL).rstrip("/")
    body = _request("GET", f"/jobs/{job_id}/results", api_key=key, base_url=base, transport=transport, timeout=timeout)
    out = _summarise(body, key)
    out["job_id"] = job_id
    return out


def _summarise(body: dict[str, Any], key: str) -> dict[str, Any]:
    status = body.get("status") if isinstance(body.get("status"), str) else None
    jid = body.get("job_id") or body.get("id")
    rows = body.get("data") if isinstance(body.get("data"), list) else []
    return {"status": status, "terminal": status in TERMINAL, "truncated": bool(body.get("truncated", False)),
            "job_id": jid if isinstance(jid, str) else None, "rows": rows,
            "provider": _sanitize({k: v for k, v in body.items() if k != "data"}, None, key)}


# ---------- normalisation (rows are untrusted) ----------
def _clean(v: Any, limit: int) -> str:
    return _CTRL.sub("", v).strip()[:limit] if isinstance(v, str) else ""


def _scrub(text: str) -> str:
    return _PHONE.sub("[phone removed]", _EMAIL.sub("[email removed]", text))


def _when(v: Any) -> datetime | None:
    try:
        if isinstance(v, bool) or v is None:
            return None
        if isinstance(v, (int, float)):
            n = float(v) / (1000.0 if v > 1e11 else 1.0)
            return datetime.fromtimestamp(n, tz=timezone.utc) if n > 0 else None
        if isinstance(v, str) and 0 < len(v.strip()) <= 40:
            d = datetime.fromisoformat(v.strip().replace("Z", "+00:00"))
            return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)
    except (ValueError, OverflowError, OSError):
        return None
    return None


def normalize_rows(p: ScrapePlan, rows: list[Any], job_id: str | None = None,
                   now: datetime | None = None) -> tuple[list[Post], dict[str, int]]:
    """Drop anything malformed, future dated, duplicated or off-source. Author data is never kept."""
    now = now or datetime.now(timezone.utc)
    dropped = {"malformed": 0, "off_source": 0, "unknown_date": 0, "future_date": 0, "duplicate": 0}
    out: list[Post] = []
    seen: set[str] = set()
    for r in rows:
        if not isinstance(r, dict):
            dropped["malformed"] += 1
            continue
        parsed = _facebook_row(r, p.target) if p.source == "facebook" else _reddit_row(r, p.target)
        if isinstance(parsed, str):
            dropped[parsed] += 1
            continue
        ext_id, title, body, url, posted_raw = parsed
        posted = _when(posted_raw)
        if posted is None:
            dropped["unknown_date"] += 1
            continue
        if posted > now + timedelta(minutes=5):
            dropped["future_date"] += 1
            continue
        if ext_id in seen:
            dropped["duplicate"] += 1
            continue
        seen.add(ext_id)
        out.append(Post(
            source=p.source, record_kind="live_imported", external_id=ext_id, title=_scrub(title)[:300],
            body=_scrub(body)[:4000], posted_at=posted, url=url,
            provenance={"provider": "mindcase", "job_id": job_id, "source_target": p.target,
                        "untrusted_content": True, "verified_live": False}))
    return out, dropped


def _facebook_row(r: dict[str, Any], group: str):
    url = str(r.get("postUrl") or "")
    u = urlsplit(url)
    if u.scheme != "https" or u.hostname not in _FB_HOSTS or u.username or u.password:
        return "malformed"
    src = (r.get("source") or {}) if isinstance(r.get("source"), dict) else {}
    src_url = str(src.get("url") or "").split("?")[0].rstrip("/")
    if src_url != group.rstrip("/") and not u.path.startswith(urlsplit(group).path.rstrip("/") + "/"):
        return "off_source"
    ext = str(r.get("postId") or "")
    text = _clean(r.get("text"), 4000)
    if not ext or len(ext) > 200 or not text:
        return "malformed"
    return ext, text[:300], text, url[:400], r.get("postedAt")


def _reddit_row(r: dict[str, Any], target: str):
    url = str(r.get("redditUrl") or "")
    try:
        u = urlsplit(url)
        port = u.port
    except ValueError:
        return "malformed"
    m = _REDDIT_POST.match(u.path)
    if u.scheme != "https" or (u.hostname or "").lower() not in _REDDIT_HOSTS or port or u.query or not m:
        return "malformed"
    if f"r/{m.group(1).lower()}" != target:
        return "off_source"
    title = _clean(r.get("title"), 300)
    if not title:
        return "malformed"
    pid = m.group(2)
    return pid, title, _clean(r.get("body"), 2000), f"https://www.reddit.com/r/{m.group(1).lower()}/comments/{pid}/", r.get("posted")
