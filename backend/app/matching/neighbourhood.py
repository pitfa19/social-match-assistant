"""Opt-in strict neighbourhood evidence. Uses ONLY the trusted shared catalogue and the post's own stored
title/body. Never uses group names, source registries or any inference from where a post was collected."""
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from .text import fold, tokens

CATALOGUE = Path(__file__).resolve().parents[3] / "shared" / "zagreb-neighbourhoods.json"
# Words that wrap a place name without being part of it. Dropped from the lexical query in strict mode.
LOCATION_NOISE = {"zagreb", "zagrebu", "kvart", "kvartu", "kvarta"}


@lru_cache(maxsize=1)
def _entries() -> dict[str, dict[str, Any]]:
    return {e["id"]: e for e in json.loads(CATALOGUE.read_text())["entries"]}


def get_place(area_id: str) -> dict[str, Any] | None:
    return _entries().get(area_id)


def _alias_map() -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for e in _entries().values():
        for a in {e["name"], *e.get("aliases", []), *e.get("curatedAliases", [])}:
            k = " ".join(tokens(a))
            if k and e not in out.setdefault(k, []):
                out[k].append(e)
    return out


def _resolves_to(sharing: list[dict[str, Any]], place: dict[str, Any]) -> bool:
    """Mirror of the frontend resolver: a name shared by a district and only its own committees means the district."""
    if len(sharing) == 1:
        return sharing[0]["id"] == place["id"]
    districts = [p for p in sharing if p["kind"] == "district"]
    if len(districts) == 1 and all(p is districts[0] or p.get("districtId") == districts[0]["id"] for p in sharing):
        return districts[0]["id"] == place["id"]
    return False


def usable_aliases(place: dict[str, Any]) -> list[str]:
    """Folded alias keys that unambiguously denote this place. Ambiguous shared names and bare generic names are dropped."""
    out = []
    for key, sharing in _alias_map().items():
        if place["id"] not in {x["id"] for x in sharing} or not _resolves_to(sharing, place):
            continue
        if place.get("generic") and key == " ".join(tokens(place["name"])):
            continue
        out.append(key)
    return sorted(out)


def evidence_regex(place: dict[str, Any]) -> str | None:
    """PostgreSQL regex over text_folded: whole-word match of any usable alias."""
    alts = ["[^a-z0-9]+".join(re.escape(t) for t in k.split()) for k in usable_aliases(place)]
    if not alts:
        return None
    return "(^|[^a-z0-9])(" + "|".join(sorted(alts, key=len, reverse=True)) + ")([^a-z0-9]|$)"


def strip_location_terms(text: str, place: dict[str, Any]) -> str:
    """Remove the selected area's own name tokens (and city/filler) so they cannot make every area post a candidate."""
    drop = set(LOCATION_NOISE)
    for key in {" ".join(tokens(a)) for a in [place["name"], *place.get("aliases", []), *place.get("curatedAliases", [])]}:
        drop.update(key.split())
    return " ".join(t for t in tokens(text) if t not in drop)


def strict_sql(place: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
    """(extra_select, extra_where, params). Applied before any candidate cap."""
    rx = evidence_regex(place)
    text_clause = "p.text_folded ~ %(nb_rx)s" if rx else "FALSE"
    select = (", CASE WHEN p.neighbourhood_id = %(nb)s THEN 'structured' ELSE 'explicit_text' END AS neighbourhood_basis")
    where = (f"AND p.record_kind <> 'synthetic' AND (p.neighbourhood_id = %(nb)s OR {text_clause})")
    return select, where, {"nb_rx": rx}


def match_info(place: dict[str, Any], basis: str) -> dict[str, str]:
    return {"id": place["id"], "name": place["name"], "basis": basis}


__all__ = ["get_place", "usable_aliases", "evidence_regex", "strip_location_terms", "strict_sql", "match_info", "fold"]
