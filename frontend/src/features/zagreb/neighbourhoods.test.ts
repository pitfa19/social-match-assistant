import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NEIGHBOURHOODS, NEIGHBOURHOOD_IDS, findNeighbourhood, CATALOGUE_META } from "./neighbourhoods.ts";
import {
  MAX_CHOICES, UNCLEAR, normalise, resolveExplicit, planFirstStage, planSecondStage, decideNeighbourhood, type ChoiceStage,
} from "./neighbourhoodResolver.ts";

const raw = JSON.parse(readFileSync(new URL("../../../../shared/zagreb-neighbourhoods.json", import.meta.url), "utf8"));
const kinds = (k: string) => NEIGHBOURHOODS.filter((n) => n.kind === k);
const sel = (text: string) => {
  const r = resolveExplicit(text);
  return r.status === "selected" ? r.place.id : r.status;
};

test("catalogue: expected official counts", () => {
  assert.equal(kinds("district").length, 17);
  assert.equal(kinds("local_committee").length, 218);
  assert.equal(kinds("colloquial_group").length, 3);
  assert.equal(NEIGHBOURHOODS.length, 238);
  assert.deepEqual(raw.counts, { district: 17, local_committee: 218, colloquial_group: 3, total: 238 });
  assert.equal(CATALOGUE_META.provenance.sources.length, 3);
});

test("catalogue: ids unique, numeric coordinates inside greater Zagreb, sane zoom", () => {
  assert.equal(new Set(NEIGHBOURHOOD_IDS).size, NEIGHBOURHOODS.length);
  for (const n of NEIGHBOURHOODS) {
    assert.ok(Number.isFinite(n.lat) && Number.isFinite(n.lng) && Number.isFinite(n.zoom), n.id);
    assert.ok(n.lat > 45.55 && n.lat < 46.0 && n.lng > 15.7 && n.lng < 16.3, n.id);
    assert.ok(n.zoom >= 12 && n.zoom <= 17, n.id);
  }
});

test("catalogue: hierarchy is consistent", () => {
  const districts = new Set(kinds("district").map((d) => d.id));
  for (const m of kinds("local_committee")) assert.ok(m.districtId && districts.has(m.districtId), m.id);
  for (const g of kinds("colloquial_group")) {
    assert.equal(g.districtId, null);
    assert.ok(g.memberIds.length >= 2 && g.memberIds.every((x) => districts.has(x)), g.id);
  }
  // every district contains at least one local committee
  for (const d of districts) assert.ok(kinds("local_committee").some((m) => m.districtId === d), d);
});

test("catalogue: provenance records official sources and limits", () => {
  const p = raw.provenance;
  assert.match(p.sources[0].dataset, /^https:\/\/data\.zagreb\.hr\//);
  assert.match(p.sources[0].sha256, /^[0-9a-f]{64}$/);
  assert.ok(p.limitations.some((l: string) => /source coverage/i.test(l)));
  assert.ok(!/@/.test(JSON.stringify(raw)), "no contact details retained");
});

test("legacy ids keep working with previous zoom", () => {
  assert.equal(findNeighbourhood("maksimir")?.id, "maksimir");
  assert.equal(findNeighbourhood("maksimir")?.zoom, 14.6);
  for (const old of ["donji-grad", "gornji-grad", "trnje", "tresnjevka", "crnomerec", "jarun", "novi-zagreb", "pescenica", "dubrava", "sesvete"]) {
    assert.ok(findNeighbourhood(old), old);
  }
  assert.equal(findNeighbourhood("gornji-grad")?.id, "gornji-grad-medvescak");
  assert.equal(findNeighbourhood("nepostojece"), undefined);
});

test("every location is selectable explicitly by its official name", () => {
  let ambiguous = 0;
  for (const n of NEIGHBOURHOODS) {
    const r = resolveExplicit(n.name);
    if (r.status === "selected") {
      // a committee sharing its district's name resolves to the district by design
      if (r.place.id !== n.id) assert.equal(r.place.id, n.districtId, n.name);
    } else {
      ambiguous++;
      assert.equal(r.status, "ambiguous", n.name);
    }
  }
  // only the intentionally generic name may refuse bare resolution
  assert.ok(ambiguous <= 2, `ambiguous official names: ${ambiguous}`);
});

test("diacritics, case and filler words", () => {
  assert.equal(normalise("Črnomerec"), "crnomerec");
  assert.equal(sel("crnomerec"), "crnomerec");
  assert.equal(sel("ČRNOMEREC"), "crnomerec");
  assert.equal(sel("Peščenica"), "pescenica-zitnjak");
  assert.equal(sel("pescenica"), "pescenica-zitnjak");
  assert.equal(sel("trešnjevka sjever"), "tresnjevka-sjever");
  assert.equal(sel("Trešnjevka - jug"), "tresnjevka-jug");
  assert.equal(sel("zanima me kvart Maksimir"), "maksimir");
  assert.equal(sel("Đurđekovec"), "mo-djurdjekovec");
  assert.equal(sel("djurdjekovec"), "mo-djurdjekovec");
});

test("colloquial groups resolve to the group, not an invented unit", () => {
  assert.equal(sel("Trešnjevka"), "tresnjevka");
  assert.equal(sel("Novi Zagreb"), "novi-zagreb");
  assert.equal(sel("Dubrava"), "dubrava");
  assert.equal(findNeighbourhood("tresnjevka")?.kind, "colloquial_group");
  assert.equal(sel("Novi Zagreb istok"), "novi-zagreb-istok");
  assert.equal(sel("Gornja Dubrava"), "gornja-dubrava");
});

test("duplicate names between a district and its own committee resolve to the district", () => {
  for (const name of ["Trnje", "Maksimir", "Brezovica", "Gornja Dubrava", "Donja Dubrava", "Gornji grad", "Peščenica"]) {
    const r = resolveExplicit(name);
    assert.equal(r.status, "selected", name);
    if (r.status === "selected") assert.equal(r.place.kind, "district", name);
  }
});

test("generic names are never resolved alone, but qualified alias works", () => {
  const r = resolveExplicit("Centar");
  assert.equal(r.status, "ambiguous");
  assert.equal(sel("Centar Sesvete"), "mo-centar");
});

test("no alias collisions remain unhandled", () => {
  const seen = new Map<string, Set<string>>();
  for (const n of NEIGHBOURHOODS) for (const a of n.aliases) {
    const k = normalise(a);
    seen.set(k, (seen.get(k) ?? new Set()).add(n.id));
  }
  for (const [k, ids] of seen) {
    if (ids.size < 2) continue;
    const r = resolveExplicit(k);
    if (r.status === "selected") assert.equal(r.place.kind, "district", k);
    else assert.equal(r.status, "ambiguous", k);
  }
  // ambiguous terms are exposed for the backend and documented in the catalogue
  assert.ok(Object.keys(raw.ambiguousTerms).length > 0);
});

test("streets, landmarks and unknown places are not inferred", () => {
  for (const t of ["Ilica", "Jarun i Maksimir", "Split", "trg bana Jelačića", "", "   "]) {
    assert.notEqual(resolveExplicit(t).status, "selected", t);
  }
});

test("choice planning never exceeds 256 and covers every place", () => {
  const first = planFirstStage();
  assert.equal(first.hierarchical, true);
  assert.ok(first.stage.choices.length <= MAX_CHOICES);
  assert.equal(first.stage.choices.length, 20 + 1, "17 districts + 3 groups + unclear");
});

test("hard cap holds even if a caller asks for a larger one", () => {
  const many = Array.from({ length: 400 }, (_, i) => ({ ...NEIGHBOURHOODS[0], id: `x${i}`, kind: "district" as const }));
  assert.throws(() => planFirstStage(many, 10_000), /> 256/);
});

test("flat plan is used only when it fits the cap", () => {
  const small = NEIGHBOURHOODS.slice(0, 20);
  assert.equal(planFirstStage(small).hierarchical, false);
  const f = planFirstStage();
  assert.ok(f.stage.choices.length <= MAX_CHOICES);
});

test("hierarchy: every location reachable in at most two capped stages", () => {
  const first = planFirstStage(NEIGHBOURHOODS);
  assert.equal(first.hierarchical, true);
  assert.ok(first.stage.choices.length <= 64);
  const reach = new Set<string>();
  for (const id of first.stage.ids) {
    const second = planSecondStage(id);
    if (!second) { reach.add(id); continue; }
    assert.ok(second.choices.length <= MAX_CHOICES, id);
    second.ids.forEach((x) => reach.add(x));
  }
  for (const n of kinds("district")) assert.ok(reach.has(n.id), n.id);
  for (const n of kinds("local_committee")) assert.ok(reach.has(n.id), n.id);
  assert.ok(first.stage.choices.at(-1)?.value === UNCLEAR);
});

test("decide: explicit alias skips Decisions entirely", async () => {
  let calls = 0;
  const d = await decideNeighbourhood("Trešnjevka sjever", async () => { calls++; return null; });
  assert.deepEqual(d, { status: "selected", id: "tresnjevka-sjever", via: "explicit" });
  assert.equal(calls, 0);
});

test("decide: ambiguous alias asks for clarification without Decisions", async () => {
  let calls = 0;
  const d = await decideNeighbourhood("Centar", async () => { calls++; return null; });
  assert.equal(d.status, "clarify");
  assert.equal(calls, 0);
});

test("decide: hierarchical path sends only capped stages and validates answers", async () => {
  const sizes: number[] = [];
  const target = kinds("local_committee").find((m) => m.districtId === "sesvete")!;
  const ask = async (s: ChoiceStage) => {
    sizes.push(s.choices.length);
    if (s.name === "district") return { choice: "sesvete", confidence: 0.9 };
    return { choice: target.id, confidence: 0.9 };
  };
  const d = await decideNeighbourhood("negdje pored velike tržnice", ask, NEIGHBOURHOODS);
  assert.deepEqual(d, { status: "selected", id: target.id, via: "decisions" });
  assert.ok(sizes.every((n) => n <= MAX_CHOICES));
  // model answer outside the offered ids is rejected
  const bad = await decideNeighbourhood("neko mjesto", async () => ({ choice: "izmisljeno", confidence: 1 }));
  assert.equal(bad.status, "clarify");
  const low = await decideNeighbourhood("neko mjesto", async () => ({ choice: "trnje", confidence: 0.2 }));
  assert.equal(low.status, "clarify");
});

test("every one of the 238 entries is reachable through an unambiguous qualified alias", () => {
  for (const n of NEIGHBOURHOODS) {
    const qualified = n.aliases.filter((a) => /^(Gradska četvrt|GČ|Mjesni odbor|MO) /.test(a));
    if (n.kind === "colloquial_group") {
      assert.equal(sel(n.name), n.id);
      continue;
    }
    assert.ok(qualified.length >= 2, n.id);
    for (const a of qualified) assert.equal(sel(a), n.id, `${n.id} via "${a}"`);
  }
});

test("kind qualifier is preserved: MO Maksimir is the committee, bare Maksimir the district", () => {
  assert.equal(sel("MO Maksimir"), "mo-maksimir");
  assert.equal(sel("mjesni odbor Maksimir"), "mo-maksimir");
  assert.equal(sel("zanima me mjesni odbor Trnje"), "mo-trnje");
  assert.equal(sel("Gradska četvrt Maksimir"), "maksimir");
  assert.equal(sel("GČ Trnje"), "trnje");
  assert.equal(sel("Maksimir"), "maksimir");
  assert.equal(sel("u kvartu Maksimir"), "maksimir");
});

test("multi-place and negative answers never resolve explicitly", () => {
  for (const t of ["Maksimir i Trnje", "Trnje ili Jarun", "MO Maksimir i MO Trnje", "ne želim Maksimir", "bilo gdje"]) {
    assert.notEqual(resolveExplicit(t).status, "selected", t);
  }
});

test("decide: NaN, missing or string confidence is rejected", async () => {
  for (const confidence of [NaN, undefined as unknown as number, "0.9" as unknown as number, -1]) {
    const d = await decideNeighbourhood("neko mjesto", async () => ({ choice: "trnje", confidence }));
    assert.equal(d.status, "clarify");
  }
  const ok = await decideNeighbourhood("neko mjesto", async () => ({ choice: "trnje", confidence: 0.5 }));
  assert.equal(ok.status, "selected");
});
