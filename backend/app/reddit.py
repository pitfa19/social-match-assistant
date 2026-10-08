"""Bounded Reddit pilot (r/zagreb, r/askcroatia only) on top of the Mindcase client.

Contract supplied by the owner and UNVERIFIED live. All provider rows are untrusted text.
No database: qualifying parent posts are remembered in a small in-process registry so comments
can only be fetched for posts this process already returned as candidates.
"""
import re
import unicodedata
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator

from . import mindcase
from .config import Settings

SUBREDDITS = ("zagreb", "askcroatia")
POSTS_PATH = "/data/reddit/posts/run"
COMMENTS_PATH = "/data/reddit/comments/run"
MAX_ROWS_POSTS = 50       # hard ceiling per call
MAX_ROWS_COMMENTS = 50
MAX_FRESHNESS_DAYS = 90
CLOCK_TOLERANCE = timedelta(minutes=5)  # provider/server clock skew allowed for "future" posts
REGISTRY_LIMIT = 500
KNOWN_RUNNING = {"pending", "queued", "running", "processing", "in_progress"}
TITLE_MAX, BODY_MAX, COMMENT_MAX = 300, 2000, 1000
_HOSTS = {"reddit.com", "www.reddit.com", "old.reddit.com"}
_POST_PATH = re.compile(r"^/r/([A-Za-z0-9_]{1,30})/comments/([a-z0-9]{1,12})(?:/[^/\s]{0,200})?/?$")
_STATUS_OK = re.compile(r"^[a-z_]{1,40}$")
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def utcnow() -> datetime:  # patched in tests
    return datetime.now(timezone.utc)


def parse_post_url(raw: str) -> tuple[str, str, str] | None:
    """Return (subreddit, post_id, canonical_url) for an allowed post URL, else None."""
    if not isinstance(raw, str):
        return None
    raw = raw.strip()
    if len(raw) > 400 or any(c.isspace() or ord(c) < 32 for c in raw):
        return None
    try:
        p = urlsplit(raw)
        port = p.port
    except ValueError:
        return None
    if p.scheme != "https" or (p.hostname or "").lower() not in _HOSTS:
        return None
    if p.username or p.password or port or p.query or p.fragment:
        return None
    m = _POST_PATH.match(p.path)
    if not m or m.group(1).lower() not in SUBREDDITS:
        return None
    sub, pid = m.group(1).lower(), m.group(2)
    return sub, pid, f"https://www.reddit.com/r/{sub}/comments/{pid}/"


def _check_sub(v: str) -> str:
    v = v.strip().lower().removeprefix("r/")
    if v not in SUBREDDITS:
        raise ValueError("subreddit must be zagreb or askcroatia")
    return v


class PostsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subreddit: str
    max_results: StrictInt = Field(ge=1, le=MAX_ROWS_POSTS)           # explicit, no default
    freshness_days: StrictInt = Field(ge=1, le=MAX_FRESHNESS_DAYS)    # explicit, no default
    keyword: str | None = Field(None, max_length=80)

    _sub = field_validator("subreddit")(_check_sub)

    @field_validator("keyword")
    @classmethod
    def _kw(cls, v):
        if v is None:
            return None
        v = _CTRL.sub("", v).strip()
        return v or None


class FilterParams(BaseModel):
    """Same filters re-supplied when fetching async job results."""
    model_config = ConfigDict(extra="forbid")
    subreddit: str
    max_results: StrictInt = Field(ge=1, le=MAX_ROWS_POSTS)
    freshness_days: StrictInt = Field(ge=1, le=MAX_FRESHNESS_DAYS)

    _sub = field_validator("subreddit")(_check_sub)


class CommentsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    post_url: str
    max_results: StrictInt = Field(ge=1, le=MAX_ROWS_COMMENTS)

    @field_validator("post_url")
    @classmethod
    def _u(cls, v: str) -> str:
        parsed = parse_post_url(v)
        if not parsed:
            raise ValueError("post_url must be a Reddit post in r/zagreb or r/askcroatia")
        return parsed[2]


# ---------- location ----------
def _fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower().replace("đ", "d"))
    return "".join(c for c in s if not unicodedata.combining(c))


_CITY = re.compile(r"\bzagreb(?:a|u|om|e)?\b|\bnov\w{1,4} zagreb\w{0,3}\b")
# class -> allowed endings after the stem (folded text, Croatian declension, deliberately simple)
_ENDINGS = {
    "f": "(?:a|e|i|u|o|om|ama|ina)?",          # Dubrava, Dubravi, Dubravom, Trešnjevkama
    "pf": "(?:e|a|i|ama|ima)",                 # Sesvete, Sesvetama, Poljanice, Poljanicama
    "m": "(?:a|u|e|i|om|em|ima|ovi)?",         # Maksimir, Maksimiru, Jarunom, Vrbani, Vrbana
    "n": "(?:o|a|u|e|og|oga|om|ima)?",         # Trnsko, Trnskog, Trnskom, Špansko
}
# name: (class, folded stems, ambiguous across Croatian/other places)
_HOOD_DEFS = {
    "Trešnjevka": ("f", ["tresnjevk", "tresnjevc"], False),
    "Dubrava": ("f", ["dubrav"], True),
    "Trnava": ("f", ["trnav"], True),
    "Gornji grad": ("x", [r"gornj\w{1,3} grad\w{0,3}"], True),
    "Donji grad": ("x", [r"donj\w{1,3} grad\w{0,3}"], True),
    "Sopot": ("m", ["sopot"], True),
    "Maksimir": ("m", ["maksimir"], False),
    "Sesvete": ("pf", ["sesvet"], False),
    "Špansko": ("n", ["spansk"], False),
    "Črnomerec": ("m", ["crnomerec", "crnomerc"], False),
    "Trnje": ("n", ["trnj"], False),
    "Jarun": ("m", ["jarun"], False),
    "Retkovec": ("m", ["retkovec", "retkovc"], False),
    "Kajzerica": ("f", ["kajzeric"], False),
    "Peščenica": ("f", ["pescenic"], False),
    "Podsused": ("m", ["podsused"], False),
    "Stenjevec": ("m", ["stenjevec", "stenjevc"], False),
    "Medveščak": ("m", ["medvescak", "medvescak"], False),
    "Knežija": ("f", ["knezij"], False),
    "Ravnice": ("pf", ["ravnic"], False),
    "Kustošija": ("f", ["kustosij"], False),
    "Vrapče": ("n", ["vrapc"], False),
    "Remetinec": ("m", ["remetinec", "remetinc"], False),
    "Savica": ("f", ["savic"], False),
    "Siget": ("m", ["siget"], False),
    "Travno": ("n", ["travn"], False),
    "Utrina": ("f", ["utrin"], False),          # also covers Utrine
    "Zapruđe": ("n", ["zaprudj"], False),
    "Lučko": ("n", ["lucko", "lucke", "lucku", "lucki"], False),
    "Gračani": ("m", ["gracan"], False),
    "Šestine": ("pf", ["sestin"], False),
    "Dubec": ("m", ["dubec", "dubc"], False),
    "Granešina": ("f", ["granesin"], False),
    "Vrbani": ("m", ["vrban"], False),
    "Trnsko": ("n", ["trnsk"], False),
    "Malešnica": ("f", ["malesnic"], False),
    "Poljanice": ("pf", ["poljanic"], False),
}
_NB_RE = {}
for _name, (_cls, _stems, _amb) in _HOOD_DEFS.items():
    _end = "" if _cls == "x" else _ENDINGS[_cls]
    _NB_RE[_name] = re.compile(r"\b(?:" + "|".join(_stems) + ")" + _end + r"\b")
AMBIGUOUS = {n for n, d in _HOOD_DEFS.items() if d[2]}
LOCATION_INPUT_MAX = 10000  # chars of title+body examined for location; longer input is flagged
VERIFICATION = "candidate_text_evidence_not_verified_physical_location"


def _snippet(text: str, start: int, end: int) -> str:
    return text[max(0, start - 30): end + 30].strip()[:120]


def detect_location(title: str, body: str, subreddit: str, input_truncated: bool = False) -> dict[str, Any]:
    """Candidate location evidence from text. Never a verified physical location.

    Subreddit alone never yields a neighbourhood. Ambiguous names (Dubrava, Trnava, Gornji/Donji grad,
    Sopot) only count as neighbourhoods when an explicit Zagreb mention is also present.
    """
    text = _fold(f"{title}\n{body}")
    evidence: list[dict[str, str]] = []
    hoods: list[str] = []
    ambiguous: list[str] = []
    city = _CITY.search(text)
    if city:
        evidence.append({"kind": "city_mention", "value": "Zagreb", "snippet": _snippet(text, city.start(), city.end())})
    for name, rx in _NB_RE.items():
        m = rx.search(text)
        if not m:
            continue
        snip = _snippet(text, m.start(), m.end())
        if name in AMBIGUOUS and not city:
            ambiguous.append(name)
            evidence.append({"kind": "ambiguous_name_mention", "value": name, "snippet": snip})
        else:
            hoods.append(name)
            evidence.append({"kind": "neighbourhood_mention", "value": name, "snippet": snip})
    if city or hoods:
        status, cty = "zagreb_mention_candidate", "Zagreb"
    elif subreddit == "zagreb":
        evidence.append({"kind": "subreddit_context", "value": "r/zagreb", "snippet": ""})
        status, cty = "zagreb_subreddit_only", "Zagreb"
    else:
        status, cty = "unknown", None
    return {"status": status, "city": cty, "neighbourhoods": hoods, "ambiguous_names": ambiguous,
            "evidence": evidence, "verification": VERIFICATION,
            "input_truncated": input_truncated}


# ---------- normalisation ----------
def _clean(v: Any, limit: int) -> str:
    if not isinstance(v, str):
        return ""
    return _CTRL.sub("", v).strip()[:limit]


def parse_posted(v: Any) -> datetime | None:
    """ISO 8601 string or epoch seconds/ms. Anything else is unknown (None)."""
    try:
        if isinstance(v, bool) or v is None:
            return None
        if isinstance(v, (int, float)):
            n = float(v)
            if n != n or n in (float("inf"), float("-inf")) or n <= 0:
                return None
            if n > 1e11:
                n /= 1000.0
            return datetime.fromtimestamp(n, tz=timezone.utc)
        if isinstance(v, str):
            s = v.strip()
            if not s or len(s) > 40:
                return None
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)
    except (ValueError, OverflowError, OSError):
        return None
    return None


def _rows(body: dict[str, Any]) -> list[Any]:
    for k in ("data",):  # owner-documented envelope only
        if isinstance(body.get(k), list):
            return body[k]
    return []


def _provenance(job_id: str | None, kind: str) -> dict[str, Any]:
    return {"source": "reddit", "record_kind": "live_imported", "provider": "mindcase",
            "job_id": job_id, "dataset": kind, "authorised_pilot": True,
            "verified_live": False}


def normalize_posts(rows: list[Any], f: FilterParams, job_id: str | None, now: datetime | None = None):
    now = now or utcnow()
    cutoff = now - timedelta(days=f.freshness_days)
    dropped = {"malformed": 0, "wrong_subreddit": 0, "unknown_date": 0, "future_date": 0,
               "stale": 0, "no_explicit_zagreb": 0, "duplicate": 0}
    out, seen = [], set()
    for r in rows:
        if not isinstance(r, dict):
            dropped["malformed"] += 1
            continue
        parsed = parse_post_url(r.get("redditUrl"))
        if not parsed:
            dropped["malformed"] += 1
            continue
        sub, pid, url = parsed
        rid = _norm_post_id(r.get("redditId"))
        if rid != pid:
            dropped["malformed"] += 1
            continue
        if sub != f.subreddit:
            dropped["wrong_subreddit"] += 1
            continue
        if pid in seen:
            dropped["duplicate"] += 1
            continue
        posted = parse_posted(r.get("posted"))
        if posted is None:
            dropped["unknown_date"] += 1
            continue
        if posted > now + CLOCK_TOLERANCE:
            dropped["future_date"] += 1
            continue
        if posted < cutoff:
            dropped["stale"] += 1
            continue
        full_title, full_body = _clean(r.get("title"), LOCATION_INPUT_MAX), _clean(r.get("body"), LOCATION_INPUT_MAX)
        if not full_title and not full_body:
            dropped["malformed"] += 1
            continue
        too_long = any(isinstance(r.get(k), str) and len(r[k]) > LOCATION_INPUT_MAX for k in ("title", "body"))
        # Location uses the full bounded text BEFORE display truncation.
        loc = detect_location(full_title, full_body, sub, too_long)
        title, body = full_title[:TITLE_MAX], full_body[:BODY_MAX]
        if sub == "askcroatia" and loc["status"] != "zagreb_mention_candidate":
            dropped["no_explicit_zagreb"] += 1
            continue
        seen.add(pid)
        out.append({"title": title, "body": body, "redditUrl": url, "redditId": pid, "posted": posted.isoformat(),
                    "subreddit": sub, "location": loc, "untrusted_content": True,
                    "provenance": _provenance(job_id, "posts")})
    out.sort(key=lambda c: c["posted"], reverse=True)
    capped = len(out) > f.max_results
    return out[: f.max_results], dropped, capped


# ---------- bounded in-memory state (lost on restart; callers cannot seed it) ----------
_registry: "OrderedDict[str, dict[str, Any]]" = OrderedDict()   # qualifying parent posts
_jobs: "OrderedDict[str, dict[str, Any]]" = OrderedDict()       # job id -> original request metadata


def reset_registry() -> None:
    _registry.clear()
    _jobs.clear()


class ParentNotQualified(Exception):
    pass


class UnknownJob(Exception):
    pass


def _bounded_put(store: OrderedDict, key: str, val: dict[str, Any]) -> None:
    store[key] = val
    store.move_to_end(key)
    while len(store) > REGISTRY_LIMIT:
        store.popitem(last=False)


def _register(c: dict[str, Any], f: FilterParams) -> None:
    """Parent eligibility expires when the post leaves the ORIGINAL freshness window."""
    expires = parse_posted(c["posted"]) + timedelta(days=f.freshness_days)
    _bounded_put(_registry, c["redditUrl"],
                 {**{k: c[k] for k in ("title", "redditUrl", "redditId", "subreddit", "posted", "location")},
                  "eligible_until": expires.isoformat()})


def _live_parent(post_url: str) -> dict[str, Any] | None:
    p = _registry.get(post_url)
    if p and parse_posted(p["eligible_until"]) <= utcnow():
        _registry.pop(post_url, None)
        return None
    return p


def _stop_polling(status: str | None) -> bool:
    """True when callers must stop: terminal, or a status we do not recognise (fail closed)."""
    return status in mindcase.TERMINAL or status not in KNOWN_RUNNING


def _job_id(body: dict[str, Any]) -> str | None:
    j = body.get("job_id") or body.get("id")
    if not isinstance(j, str):
        return None
    try:
        return str(UUID(j))
    except ValueError:
        return None


def _status(body: dict[str, Any]) -> str | None:
    s = body.get("status")
    if isinstance(s, str) and _STATUS_OK.match(s):
        return s
    return "unknown" if s is not None else None


async def _fetch(method: str, path: str, settings: Settings, transport, **kw) -> dict[str, Any]:
    body = await mindcase._call(method, path, settings, transport, **kw)
    # Redact the API key from every provider string BEFORE any normalisation.
    return mindcase.sanitize(body, None, settings.api_key)


def _posts_response(body: dict[str, Any], f: FilterParams, job_id: str | None) -> dict[str, Any]:
    rows = _rows(body)
    cands, dropped, capped = normalize_posts(rows, f, job_id)
    status = _status(body)
    registered = status == "completed"  # partial/running/failed data never seeds parent eligibility
    if registered:
        for c in cands:
            _register(c, f)
    return {"status": status, "terminal": status in mindcase.TERMINAL, "stop_polling": _stop_polling(status),
            "parents_registered": registered,
            "partial": not registered or bool(body.get("truncated", False)),
            "truncated": bool(body.get("truncated", False)), "job_id": job_id,
            "filters": {"subreddit": f.subreddit, "max_results": f.max_results, "freshness_days": f.freshness_days},
            "rows_seen": len(rows), "capped_locally": capped, "dropped": dropped, "candidates": cands}


async def run_posts(req: PostsRequest, settings: Settings, transport=None) -> dict[str, Any]:
    params: dict[str, Any] = {"urls": f"https://www.reddit.com/r/{req.subreddit}/",
                              "maxResults": req.max_results, "sortBy": "new"}
    if req.keyword:
        params["keyword"] = req.keyword
    body = await _fetch("POST", POSTS_PATH, settings, transport, params={"wait": "true"}, json={"params": params})
    f = FilterParams(subreddit=req.subreddit, max_results=req.max_results, freshness_days=req.freshness_days)
    jid = _job_id(body)
    if jid:
        _bounded_put(_jobs, jid, {"kind": "posts", "filters": f})
    return _posts_response(body, f, jid)


async def posts_job_results(job_id: str, settings: Settings, transport=None) -> dict[str, Any]:
    meta = _jobs.get(job_id)
    if not meta or meta["kind"] != "posts":
        raise UnknownJob()
    body = await _fetch("GET", f"/jobs/{job_id}/results", settings, transport)
    return _posts_response(body, meta["filters"], job_id)


# ---------- comments (owner schema: commentUrl, commentId, comment, posted, parentId, postId, postUrl, subreddit) ----------
_COMMENT_ID = re.compile(r"^(?:t1_)?([a-z0-9]{1,12})$")
_PARENT_ID = re.compile(r"^t[13]_[a-z0-9]{1,12}$")
_COMMENT_PATH = re.compile(r"^/r/([A-Za-z0-9_]{1,30})/comments/([a-z0-9]{1,12})/[^/\s]{0,200}/(?:comment/)?([a-z0-9]{1,12})/?$")


def _norm_post_id(v: Any) -> str | None:
    if not isinstance(v, str):
        return None
    v = v.strip()
    v = v[3:] if v.startswith("t3_") else v
    return v if re.fullmatch(r"[a-z0-9]{1,12}", v) else None


def _norm_comment_url(v: Any, parent: dict[str, Any]) -> str | None:
    """Return canonical commentUrl only if https reddit comment on the parent post."""
    if not isinstance(v, str) or len(v) > 500 or any(c.isspace() or ord(c) < 32 for c in v):
        return None
    try:
        p = urlsplit(v.strip())
        port = p.port
    except ValueError:
        return None
    if p.scheme != "https" or (p.hostname or "").lower() not in _HOSTS or p.username or p.password or port:
        return None
    m = _COMMENT_PATH.match(p.path)
    if not m or m.group(1).lower() != parent["subreddit"] or m.group(2) != parent["redditId"]:
        return None
    return f"https://www.reddit.com/r/{parent['subreddit']}/comments/{parent['redditId']}/comment/{m.group(3)}/"


def normalize_comments(rows: list[Any], parent: dict[str, Any], job_id: str | None, cap: int):
    out = []
    dropped = {"malformed": 0, "wrong_parent": 0, "no_text": 0, "duplicate": 0}
    seen = set()
    for r in rows:
        if not isinstance(r, dict):
            dropped["malformed"] += 1
            continue
        pu = parse_post_url(r.get("postUrl"))
        pid = _norm_post_id(r.get("postId"))
        if not pu or not pid:
            dropped["wrong_parent"] += 1   # missing/invalid postUrl or postId is rejected, never assumed
            continue
        if pu[1] != parent["redditId"] or pu[0] != parent["subreddit"] or pid != parent["redditId"]:
            dropped["wrong_parent"] += 1
            continue
        sub = r.get("subreddit")
        if sub is not None and (not isinstance(sub, str) or sub.strip().lower().removeprefix("r/") != parent["subreddit"]):
            dropped["wrong_parent"] += 1
            continue
        text = _clean(r.get("comment"), COMMENT_MAX)
        if not text:
            dropped["no_text"] += 1
            continue
        raw_cid = r.get("commentId")
        m = _COMMENT_ID.match(raw_cid.strip()) if isinstance(raw_cid, str) else None
        curl = _norm_comment_url(r.get("commentUrl"), parent) if r.get("commentUrl") is not None else None
        if not m or (r.get("commentUrl") is not None and not curl):
            dropped["malformed"] += 1
            continue
        cid = m.group(1)
        if curl and curl.rstrip('/').rsplit('/', 1)[-1] != cid:
            dropped["malformed"] += 1
            continue
        if cid in seen:
            dropped["duplicate"] += 1
            continue
        seen.add(cid)
        par = r.get("parentId")
        par = par.strip() if isinstance(par, str) and _PARENT_ID.match(par.strip()) else None
        posted = parse_posted(r.get("posted"))
        out.append({"comment": text, "commentId": cid, "commentUrl": curl, "parentId": par,
                    "postId": parent["redditId"], "postUrl": parent["redditUrl"], "subreddit": parent["subreddit"],
                    "posted": posted.isoformat() if posted else None, "untrusted_content": True,
                    "provenance": _provenance(job_id, "comments")})
    return out[:cap], dropped, len(out) > cap


def _comments_response(body: dict[str, Any], parent: dict[str, Any], cap: int, job_id: str | None) -> dict[str, Any]:
    rows = _rows(body)
    comments, dropped, capped = normalize_comments(rows, parent, job_id, cap)
    status = _status(body)
    return {"status": status, "terminal": status in mindcase.TERMINAL, "stop_polling": _stop_polling(status),
            "partial": status != "completed" or bool(body.get("truncated", False)),
            "truncated": bool(body.get("truncated", False)), "job_id": job_id,
            "parent": dict(parent), "rows_seen": len(rows), "capped_locally": capped,
            "dropped": dropped, "comments": comments}


async def run_comments(req: CommentsRequest, settings: Settings, transport=None) -> dict[str, Any]:
    parent = _live_parent(req.post_url)
    if not parent:
        raise ParentNotQualified()  # before any network call
    body = await _fetch("POST", COMMENTS_PATH, settings, transport, params={"wait": "true"},
                        json={"params": {"inputs": req.post_url, "maxResults": req.max_results,
                                         "includeComments": True}})
    jid = _job_id(body)
    if jid:
        _bounded_put(_jobs, jid, {"kind": "comments", "parent": dict(parent), "max_results": req.max_results})
    return _comments_response(body, parent, req.max_results, jid)


async def comments_job_results(job_id: str, settings: Settings, transport=None) -> dict[str, Any]:
    meta = _jobs.get(job_id)
    if not meta or meta["kind"] != "comments":
        raise UnknownJob()
    body = await _fetch("GET", f"/jobs/{job_id}/results", settings, transport)
    return _comments_response(body, meta["parent"], meta["max_results"], job_id)
