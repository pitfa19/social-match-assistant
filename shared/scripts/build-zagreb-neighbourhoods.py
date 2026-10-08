#!/usr/bin/env python3
"""Build shared/zagreb-neighbourhoods.json from official City of Zagreb open data.

Needs: pip install pyshp pyproj shapely. Network: data.zagreb.hr (open licence, read-only downloads).
Usage: build-zagreb-neighbourhoods.py WORKDIR OUTPUT_JSON
Coordinates are derived from official polygons only. Nothing is hand-entered
except slug-compatible legacy ids, legacy zoom levels and the curated alias list below.
"""
import csv, hashlib, io, json, math, re, sys, unicodedata, urllib.request, zipfile
from pathlib import Path
import shapefile
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import unary_union, transform

GC_URL = "https://data.zagreb.hr/dataset/9c52e229-09bf-4569-8e01-37f338070d02/resource/f2406ad9-34bf-4235-aa24-d71a08ae2863/download/rpj_gc.zip"
MO_URL = "https://data.zagreb.hr/dataset/37fa6630-0a87-4084-b62d-ff5edab3610b/resource/482b7289-d397-4c38-9929-5d0410ad0e16/download/rpj_mo.zip"
CSV_URL = "https://data.zagreb.hr/dataset/4dc300c3-ab50-454d-98d1-47cd739b1132/resource/de825f7b-9d87-4159-9500-475651e0acb3/download/mjesniodborii.csv"

# Existing (pre-catalogue) ids kept working. value: (target id, legacy zoom or None)
LEGACY = {
    "donji-grad": ("donji-grad", 15.6), "gornji-grad": ("gornji-grad-medvescak", 15.8),
    "trnje": ("trnje", 14.8), "maksimir": ("maksimir", 14.6), "crnomerec": ("crnomerec", 14.4),
    "jarun": ("mo-jarun", 14.6), "pescenica": ("pescenica-zitnjak", 14.2), "sesvete": ("sesvete", 14.0),
}
# Colloquial groups: union of official districts, not official units themselves.
GROUPS = {
    "tresnjevka": ("Trešnjevka", ["tresnjevka-sjever", "tresnjevka-jug"], ["Trešnjevka"]),
    "novi-zagreb": ("Novi Zagreb", ["novi-zagreb-istok", "novi-zagreb-zapad"], ["Novi Zagreb"]),
    "dubrava": ("Dubrava", ["gornja-dubrava", "donja-dubrava"], ["Dubrava"]),
}
# Curated colloquial aliases for official entries.
CURATED = {
    "gornji-grad-medvescak": ["Gornji grad", "Gornji Grad Medveščak", "Medveščak Gornji grad"],
    "pescenica-zitnjak": ["Peščenica", "Peščenica Žitnjak"],
    "podsused-vrapce": ["Podsused Vrapče"],
}
GENERIC_NAMES = {"centar"}  # official MO names too generic to resolve on their own

def norm(s):
    s = s.lower().replace("đ", "dj")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join("".join(c if c.isalnum() else " " for c in s).split())

def slug(s):
    return norm(s).replace(" ", "-")

def fetch(url, path):
    if not path.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "social-match-assistant-geo-build"})
        path.write_bytes(urllib.request.urlopen(req, timeout=120).read())
    return path

def read_zip(zpath, stem):
    d = zpath.with_suffix("")
    with zipfile.ZipFile(zpath) as z:
        z.extractall(d)
    r = shapefile.Reader(str(d / stem), encoding="cp1250")
    return [(rec.as_dict(), shape(s.__geo_interface__)) for rec, s in zip(r.records(), r.shapes())]

def main():
    work, out = Path(sys.argv[1]), Path(sys.argv[2])
    work.mkdir(parents=True, exist_ok=True)
    gc_zip, mo_zip, csv_p = fetch(GC_URL, work / "rpj_gc.zip"), fetch(MO_URL, work / "rpj_mo.zip"), fetch(CSV_URL, work / "mo.csv")
    gcs, mos = read_zip(gc_zip, "RPJ_GC"), read_zip(mo_zip, "RPJ_MO")
    assert len(gcs) == 17 and len(mos) == 218, (len(gcs), len(mos))
    to_ll = Transformer.from_crs("EPSG:3765", "EPSG:4326", always_xy=True).transform

    def anchor(geom):
        c = geom.centroid
        method = "centroid"
        if not geom.contains(c):
            c, method = geom.representative_point(), "representative_point"
        lng, lat = to_ll(c.x, c.y)
        x0, y0, x1, y1 = geom.bounds
        (a, b), (c2, d) = to_ll(x0, y0), to_ll(x1, y1)
        return round(lat, 5), round(lng, 5), method, [round(a, 5), round(b, 5), round(c2, 5), round(d, 5)]

    def zoom(bbox):
        dlng = max(bbox[2] - bbox[0], 1e-6)
        dlat = max(bbox[3] - bbox[1], 1e-6)
        zx = math.log2(900 * 360 / (256 * dlng))
        zy = math.log2(560 * 360 / (256 * dlat * 1.4))
        return round(min(17.0, max(12.6, min(zx, zy) - 0.3)), 1)

    entries, geoms = [], {}
    district_name = {}
    district_by_norm = {}
    for rec, g in sorted(gcs, key=lambda x: norm(x[0]["JMS_IME"])):
        name = rec["JMS_IME"].strip()
        eid = slug(name)
        geoms[eid] = g
        district_by_norm[norm(name)] = eid
        district_name[eid] = name
        entries.append({"id": eid, "name": name, "kind": "district", "districtId": eid, "officialCode": rec["JMS_MB"]})
    # CSV cross-check of MO -> district membership
    csv_rows = list(csv.reader(io.StringIO(csv_p.read_text(encoding="utf-8-sig")), delimiter=";"))[1:]
    csv_district = {norm(r[0]): district_by_norm[norm(r[3])] for r in csv_rows}
    assert len(csv_district) == 218
    mismatches, unmatched, agreed = [], [], 0
    for rec, g in sorted(mos, key=lambda x: norm(x[0]["JMS_IME"])):
        name = rec["JMS_IME"].strip().strip('"').strip()
        best = max(geoms.items(), key=lambda kv: kv[1].intersection(g).area)
        eid = "mo-" + slug(name)
        cd = csv_district.get(norm(name))
        if cd is None:
            unmatched.append(name)
        elif cd != best[0]:
            mismatches.append((name, best[0], cd))
        else:
            agreed += 1
        geoms[eid] = g
        entries.append({"id": eid, "name": name, "kind": "local_committee", "districtId": best[0], "officialCode": rec["JMS_MB"]})
    assert len({e["id"] for e in entries}) == 235
    assert not mismatches, mismatches
    for gid, (gname, members, _) in GROUPS.items():
        geoms[gid] = unary_union([geoms[m] for m in members])
        entries.append({"id": gid, "name": gname, "kind": "colloquial_group", "districtId": None, "memberIds": members})

    legacy_by_target = {}
    for old, (target, z) in LEGACY.items():
        legacy_by_target.setdefault(target, []).append((old, z))
    for e in entries:
        lat, lng, method, bbox = anchor(geoms[e["id"]])
        e.update(lat=lat, lng=lng, anchorMethod=method, bbox=bbox, zoom=zoom(bbox))
        n = e["name"]
        e["generic"] = e["kind"] == "local_committee" and norm(n) in GENERIC_NAMES
        aliases = {n}
        aliases.add(re.sub(r"\s+-\s+", " ", n))
        if "Peščenica" in n or "Trešnjevka" in n: pass
        aliases.update(CURATED.get(e["id"], []))
        if e["kind"] == "local_committee" and norm(n) in GENERIC_NAMES:
            aliases.add(n + " " + district_name[e["districtId"]])
        # Kind-qualified aliases keep district vs local committee explicit and always reachable.
        base = [n] + ([n + " " + district_name[e["districtId"]]] if e["generic"] else [])
        for b in (base if e["generic"] else [n]):
            if e["kind"] == "district":
                aliases.update(["Gradska četvrt " + b, "GČ " + b])
            elif e["kind"] == "local_committee":
                aliases.update(["Mjesni odbor " + b, "MO " + b])
        if e["kind"] == "colloquial_group":
            aliases.add(n)
        e["curatedAliases"] = sorted(CURATED.get(e["id"], []) + ([e["name"]] if e["kind"] == "colloquial_group" else []))
        # unique by normalised form, keep first (official) spelling
        seen, out_al = set(), []
        for a in [e["name"]] + sorted(aliases - {e["name"]}):
            if norm(a) and norm(a) not in seen:
                seen.add(norm(a)); out_al.append(a)
        e["aliases"] = out_al
        if e["id"] in legacy_by_target:
            e["legacyIds"] = [o for o, _ in legacy_by_target[e["id"]]]
            e["zoom"] = legacy_by_target[e["id"]][0][1]
        elif e["kind"] == "colloquial_group":
            e["legacyIds"] = [e["id"]]
        else:
            e["legacyIds"] = []
        e["generic"] = e["kind"] == "local_committee" and norm(e["name"]) in GENERIC_NAMES
        for k in ("districtId",):
            pass
    # group ids are themselves legacy ids; they are the canonical ids too
    for e in entries:
        if e["kind"] == "colloquial_group":
            e["legacyIds"] = []

    # name collisions across kinds (informational, resolver applies precedence)
    by = {}
    for e in entries:
        for a in e["aliases"]:
            by.setdefault(norm(a), set()).add(e["id"])
    collisions = {k: sorted(v) for k, v in sorted(by.items()) if len(v) > 1}

    def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
    doc = {
        "schemaVersion": 1,
        "title": "Zagreb administrative geography: city districts, local committees, colloquial groups",
        "counts": {"district": 17, "local_committee": 218, "colloquial_group": len(GROUPS), "total": len(entries)},
        "kinds": {
            "district": "Gradska četvrt, official 17 units of local self-government",
            "local_committee": "Mjesni odbor, official 218 units of local self-government nested in districts",
            "colloquial_group": "Common colloquial area made of official districts. Not an official unit.",
        },
        "provenance": {
            "generatedBy": "shared/scripts/build-zagreb-neighbourhoods.py",
            "publisher": "Grad Zagreb, Portal otvorenih podataka (data.zagreb.hr)",
            "licence": "Otvorena dozvola (OD)",
            "retrievedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sources": [
                {"role": "district geometries", "dataset": "https://data.zagreb.hr/dataset/gradske-cetvrti-prostorna-jedinica-mjesne-samouprave-za-podrucje-grada-zagreba", "resource": GC_URL, "sha256": sha(gc_zip), "format": "SHP", "crs": "EPSG:3765 HTRS96/Croatia TM", "recordDate": "2025-02-03", "records": 17},
                {"role": "local committee geometries", "dataset": "https://data.zagreb.hr/dataset/mjesni-odbori-prostorna-jedinica-mjesne-samouprave-za-podrucje-grada-zagreba", "resource": MO_URL, "sha256": sha(mo_zip), "format": "SHP", "crs": "EPSG:3765 HTRS96/Croatia TM", "recordDate": "2025-02-03", "records": 218},
                {"role": "district membership cross-check", "dataset": "https://data.zagreb.hr/dataset/mjesni-odbori", "resource": CSV_URL, "sha256": sha(csv_p), "format": "CSV", "records": 218, "note": f"Older 2024 table. {agreed} local committees matched by name and agree on district, {len(unmatched)} have no same-named row (renamed or split since): {', '.join(unmatched)}. Used only as a cross-check, never as source of names or coordinates."},
            ],
            "method": "Anchors are the polygon centroid in EPSG:3765, or a representative point inside the polygon when the centroid falls outside it, transformed to WGS84. bbox is the polygon bounding box. Zoom is derived from bbox for a ~900x560 viewport, except legacy ids which keep their earlier zoom. districtId of a local committee is the district with the largest polygon overlap and was cross-checked against the official CSV with zero mismatches. Colloquial groups use the union of member district polygons.",
            "limitations": [
                "Boundaries reflect the 2025-02-03 official record. Later changes to mjesna samouprava are not reflected until regenerated.",
                "Only official districts and local committees come from official data. Colloquial groups and curated aliases are a small hand-written list and are not an exhaustive list of informal names, neighbourhood nicknames, streets, landmarks or settlements.",
                "Geographic availability is not source coverage. A location being selectable says nothing about whether any Facebook group, Reddit thread or user request exists there. Group presence is never inferred.",
                "Frontend highlight remains an approximate circle around the anchor, not the administrative boundary.",
                "Polygon geometry is not stored here, only anchor and bounding box.",
            ],
        },
        "ambiguousTerms": {k: v for k, v in collisions.items()},
        "entries": entries,
    }
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(doc["counts"], "collisions:", len(collisions))

main()
