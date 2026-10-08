"""Minimal async Mindcase client. Contract supplied by owner, untested against the live API."""
from typing import Any

import httpx

from .config import Settings
from .schemas import FacebookGroupScrape

TERMINAL = {"completed", "failed", "cancelled", "rejected_balance"}
RUN_PATH = "/data/facebook/posts/run"


class ProviderError(Exception):
    """Sanitized error. Never carries provider body text or headers."""

    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


def build_payload(req: FacebookGroupScrape) -> dict[str, Any]:
    params: dict[str, Any] = {"groupUrls": req.group_url, "maxResults": req.max_results}
    if req.newer_than:
        params["onlyPostsNewerThan"] = req.newer_than.isoformat()
    # Owner-supplied Mindcase contract: Bearer auth, body {"params": {...}}. Not verified live.
    return {"params": params}


def _timeout(s: Settings) -> httpx.Timeout:
    return httpx.Timeout(connect=s.connect_timeout, read=s.read_timeout, write=10.0, pool=5.0)


def _status_error(code: int) -> ProviderError:
    if code in (401, 403):
        return ProviderError(502, "provider_auth", "Provider rejected the backend credentials.")
    if code == 402:
        return ProviderError(402, "provider_balance", "Provider balance is insufficient.")
    if code == 429:
        return ProviderError(429, "provider_rate_limited", "Provider rate limit reached. Try later.")
    if 500 <= code < 600:
        return ProviderError(502, "provider_unavailable", "Provider failed. Not retried to avoid duplicate cost.")
    return ProviderError(502, "provider_rejected", "Provider rejected the request.")


async def _call(method: str, path: str, settings: Settings, transport, **kw) -> dict[str, Any]:
    if not settings.api_key:
        raise ProviderError(503, "not_configured", "MINDCASE_API_KEY is not configured on the backend.")
    headers = {"Authorization": f"Bearer {settings.api_key}", "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(
            base_url=settings.base_url, timeout=_timeout(settings), transport=transport,
            follow_redirects=False,
        ) as client:
            resp = await client.request(method, path, headers=headers, **kw)
    except httpx.TimeoutException:
        raise ProviderError(504, "provider_timeout", "Provider timed out. The job may still be running, check results later.") from None
    except httpx.HTTPError:
        raise ProviderError(502, "provider_unreachable", "Could not reach provider.") from None
    if resp.status_code >= 300:
        raise _status_error(resp.status_code)
    try:
        body = resp.json()
    except ValueError:
        raise ProviderError(502, "provider_bad_response", "Provider returned non-JSON.") from None
    if not isinstance(body, dict):
        raise ProviderError(502, "provider_bad_response", "Provider returned unexpected JSON.")
    return body


_MSG_KEYS = {"error", "errors", "message", "notice", "detail", "reason", "warning"}
_WITHHELD = "[provider message withheld]"


def sanitize(value: Any, key: str | None, secret: str | None) -> Any:
    """Withhold free-text provider message fields and redact the API key everywhere."""
    if isinstance(value, dict):
        return {k: sanitize(v, k, secret) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize(v, key, secret) for v in value]
    if isinstance(value, str):
        if key and key.lower() in _MSG_KEYS:
            return _WITHHELD
        if secret and secret in value:
            return value.replace(secret, "[redacted]")
    return value


def summarize(body: dict[str, Any], secret: str | None = None) -> dict[str, Any]:
    status = body.get("status") if isinstance(body.get("status"), str) else None
    return {
        "status": status,
        "terminal": status in TERMINAL,
        "truncated": bool(body.get("truncated", False)),  # preserved, never discarded
        "provider": sanitize(body, None, secret),
    }


async def run_group_posts(req: FacebookGroupScrape, settings: Settings, transport=None) -> dict[str, Any]:
    # Single POST, no retry: a retry could be billed twice.
    body = await _call("POST", RUN_PATH, settings, transport, params={"wait": "true"}, json=build_payload(req))
    out = summarize(body, settings.api_key)
    jid = body.get("job_id") or body.get("id")
    out["job_id"] = jid if isinstance(jid, str) else None
    return out


async def job_results(job_id: str, settings: Settings, transport=None) -> dict[str, Any]:
    body = await _call("GET", f"/jobs/{job_id}/results", settings, transport)
    out = summarize(body, settings.api_key)
    out["job_id"] = job_id
    return out
