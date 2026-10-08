import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswer, initialState, removeNote, noteKey } from "./profileLogic.ts";
import { parseAdaptiveResponse } from "./server/semanticProfile.ts";
import { buildIndexedQueries, parseIndexResults, safeExternalUrl, searchFacts } from "./indexedSearch.ts";
import { fetchIndexedMatches, validateMatchInput } from "./server/indexedMatches.ts";

const wrap = (obj: unknown) => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(obj) }] }] });
const full = "Ja sam programer. Volim knjige. Nudim pomoć s računalima. Živim u Maksimiru.";
const payload = {
  items: [{ fact: "programer", evidence: "Ja sam programer", topic: "tehnologija", about_user: true, role: "description" },
    { fact: "voli knjige", evidence: "Volim knjige", topic: "knjige", about_user: true, role: "interest" },
    { fact: "nudi pomoć s računalima", evidence: "Nudim pomoć s računalima", topic: "tehnologija", about_user: true, role: "offer" }],
  coverage: [0, 1, 2].map((step) => ({ step, evidence: ["Ja sam programer", "Volim knjige", "Nudim pomoć s računalima"][step], about_user: true })),
  place: { name: "Maksimir", evidence: "Živim u Maksimiru", about_user: true },
};

test("one grounded answer can cover the whole flow with no second model call", () => {
  const parsed = parseAdaptiveResponse(wrap(payload), full)!;
  assert.equal(parsed.neighbourhoodId, "maksimir");
  assert.deepEqual(parsed.coverage, [0, 1, 2]);
  const state = applyAnswer(initialState, 0, parsed.items, parsed.coverage, parsed.neighbourhoodId);
  assert.equal(state.step, 4);
  assert.equal(state.notes.filter((n) => n.kind === "fact").length, 3);
});
test("partial coverage skips only answered topics and retains early area", () => {
  const first = applyAnswer(initialState, 0, [], [0, 2], "maksimir");
  assert.equal(first.step, 1);
  assert.equal(applyAnswer(first, 1, [], [1]).step, 4);
  assert.equal(applyAnswer(initialState, 0, [], [0, 1]).step, 2);
  assert.equal(applyAnswer(initialState, 0, [], [0, 1, 2]).step, 3);
});
test("occupation/topic does not by itself imply interest or offer", () => {
  const parsed = parseAdaptiveResponse(wrap({ ...payload, items: [payload.items[0]], coverage: [payload.coverage[0]], place: null }), "Ja sam programer")!;
  assert.equal(applyAnswer(initialState, 0, parsed.items, parsed.coverage).step, 1);
});
test("successful empty extraction accepts the current answer without inventing future coverage", () => {
  const first = applyAnswer(initialState, 0, [], [], "maksimir");
  assert.equal(first.step, 1);
  assert.deepEqual(first.notes, []);
  assert.deepEqual(first.covered, [0]);
  assert.equal(first.neighbourhoodId, "maksimir");
  assert.equal(applyAnswer(first, 1, [], [1, 2]).step, 4);
});
test("third question accepts uncertainty and does not loop on absent semantic coverage", () => {
  const first = applyAnswer(initialState, 0, [], [0]);
  const second = applyAnswer(first, 1, [], [1]);
  const third = applyAnswer(second, 2, [], []);
  assert.equal(third.step, 3);
  assert.deepEqual(third.notes, []);
  assert.deepEqual(third.covered, [0, 1, 2]);
  assert.equal(applyAnswer({ ...second, neighbourhoodId: "maksimir" }, 2, [], []).step, 4);
  assert.equal(applyAnswer(third, 2, [], []), third);
  assert.equal(applyAnswer(third, 3, [], []), third);
});
test("coverage and area require real quoted self evidence", () => {
  const parsed = parseAdaptiveResponse(wrap({ ...payload, coverage: [{ step: 2, evidence: "not present", about_user: true },
    { step: 1, evidence: "Volim knjige", about_user: false }], place: { ...payload.place, name: "Sesvete" } }), full)!;
  assert.deepEqual(parsed.coverage, []);
  assert.equal(parsed.neighbourhoodId, undefined);
  assert.equal(parseAdaptiveResponse(wrap({ ...payload, coverage: [{ step: 99 }] }), full), null);
  assert.equal(parseAdaptiveResponse(wrap({ items: [] }), full), null);
});
test("negated or third-party location never skips the area question", () => {
  for (const place of [{ name: "Maksimir", evidence: "Ne želim Maksimir", about_user: true },
    { name: "Maksimir", evidence: "Brat živi u Maksimiru", about_user: false }]) {
    assert.equal(parseAdaptiveResponse(wrap({ items: [], coverage: [], place }), place.evidence)?.neighbourhoodId, undefined);
  }
});
test("unsupported location and generic ambiguity remain unresolved", () => {
  for (const name of ["Centar", "Atlantida"]) {
    const result = parseAdaptiveResponse(wrap({ items: [], coverage: [], place: { name, evidence: name, about_user: true } }), name);
    assert.equal(result?.neighbourhoodId, undefined);
  }
});
test("stale answers ignored and deleted facts stay excluded from matching", () => {
  let s = applyAnswer(initialState, 0, [{ text: "voli knjige", topic: "knjige", role: "interest" }], [0, 1]);
  assert.equal(applyAnswer(s, 0, [], [2]), s);
  s = removeNote(s, noteKey("fact", "voli knjige"));
  s = applyAnswer(s, 2, [{ text: "voli knjige", topic: "knjige", role: "interest" }], [2]);
  assert.deepEqual(searchFacts(s.notes), []);
});
test("index planner prioritises actionable intent, splits mixed intent into at most two queries", () => {
  const q = buildIndexedQueries([{ text: "programer", role: "description" }, { text: "voli knjige", role: "interest" },
    { text: "traži stan", role: "request" }, { text: "nudi pomoć", role: "offer" }, { text: "ne voli sport", role: "interest" }], "maksimir");
  assert.equal(q.length, 2);
  assert.deepEqual(q.map((r) => [r.kind, r.text, r.neighbourhood_id]), [["request", "traži stan", "maksimir"], ["offer", "nudi pomoć", "maksimir"]]);
  assert.deepEqual(buildIndexedQueries([{ text: "ne voli sport", role: "interest" }], null), []);
});
test("URLs and synthetic benchmark records cannot masquerade as live results", () => {
  for (const url of ["javascript:alert(1)", "http://example.com", "https://u:p@example.com", "invalid"]) assert.equal(safeExternalUrl(url), null);
  const rows = parseIndexResults({ mode: "indexed", truncated: false, results: [
    { id: 1, record_kind: "synthetic", title: "Fake" }, { id: 2, record_kind: "live_imported", title: "Real", url: "javascript:alert(1)" },
  ] })!;
  assert.equal(rows.results.length, 1); assert.equal(rows.results[0].url, null);
  assert.equal(parseIndexResults({ mode: "brute", results: [] }), null);
});
test("input cannot choose corpus, endpoint, unbounded facts or invalid geography", () => {
  const base = { areaId: "maksimir", cityWide: false, facts: [] };
  assert.ok(validateMatchInput(base));
  for (const d of [{ ...base, corpus: "fixture" }, { ...base, areaId: "fake" }, { ...base, facts: Array(25).fill({ text: "x", role: "offer" }) }]) assert.equal(validateMatchInput(d), null);
});
test("fixed indexed bridge makes bounded parallel reads, dedupes and never sends a scoring/collection request", async () => {
  const calls: Array<{ url: string; body: any }> = [];
  const mock = (async (url: URL, init: RequestInit) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(String(init.body)) : null });
    return Response.json(String(url).includes("/sources") ? { sources: [] } : { mode: "indexed", truncated: false,
      results: [{ id: 37, record_kind: "live_imported", source: "reddit", title: "Pranje tepiha", body: "content", unknown_fields: ["neighbourhood"] }] });
  }) as typeof fetch;
  const r = await fetchIndexedMatches({ areaId: "maksimir", cityWide: false, facts: [{ text: "traži tepih", role: "request" }, { text: "nudi pranje tepiha", role: "offer" }] },
    { base: "http://backend.test", token: "test" }, new AbortController().signal, mock);
  assert.equal(calls.length, 3); assert.equal(r.results.length, 1);
  assert.ok(r.indexAvailable && r.sourcesAvailable);
  assert.ok(calls.filter((c) => c.body).every((c) => c.body.mode === "indexed" && c.body.max_candidates === 12 && c.body.query.neighbourhood_id === "maksimir"));
});
test("partial upstream failure is not a fake empty success", async () => {
  const mock = (async (url: URL) => String(url).includes("sources") ? Response.json({ sources: [] }) : new Response("fail", { status: 503 })) as typeof fetch;
  const r = await fetchIndexedMatches({ areaId: "maksimir", cityWide: true, facts: [{ text: "stan", role: "request" }] },
    { base: "http://backend.test", token: "test" }, new AbortController().signal, mock);
  assert.equal(r.indexAvailable, false); assert.equal(r.sourcesAvailable, true);
});
