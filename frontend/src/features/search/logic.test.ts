import test from "node:test";
import assert from "node:assert/strict";
import { search, parseBudget, totalCost, buildDraft, createSavedStore, tokenize } from "./logic.ts";
import { LISTINGS } from "../../fixtures/listings.ts";

const base = { intent: "", profile: "", useProfile: false, category: "all", budget: "", area: "all" } as const;

test("fixtures: 15+ synthetic, no urls, all sources present", () => {
  assert.ok(LISTINGS.length >= 15);
  assert.ok(LISTINGS.every((l) => l.provenance === "synthetic"));
  assert.ok(!JSON.stringify(LISTINGS).includes("http"));
  assert.deepEqual([...new Set(LISTINGS.map((l) => l.source))].sort(), ["community", "facebook", "reddit"]);
});

test("parseBudget distinguishes empty, invalid, ok", () => {
  assert.equal(parseBudget("  ").state, "empty");
  assert.equal(parseBudget("abc").state, "invalid");
  assert.equal(parseBudget("-5").state, "invalid");
  assert.deepEqual(parseBudget("500 €"), { state: "ok", value: 500 });
  assert.deepEqual(parseBudget("450,5"), { state: "ok", value: 450.5 });
});

test("rental total is rent + utilities, unknown when utilities missing", () => {
  const r = LISTINGS.find((l) => l.id === "demo-01")!;
  assert.equal(totalCost(r), 570);
  assert.equal(totalCost(LISTINGS.find((l) => l.id === "demo-03")!), null);
});

test("budget applies to rent + utilities and hides unknown prices", () => {
  const o = search({ ...base, category: "rental", budget: "500" });
  const ids = o.results.map((r) => r.listing.id);
  assert.ok(ids.includes("demo-02"));
  assert.ok(ids.includes("demo-16"));
  assert.ok(!ids.includes("demo-01")); // 570 > 500
  assert.ok(!ids.includes("demo-03")); // unknown
  assert.ok(o.hiddenUnknownPrice >= 2);
});

test("invalid budget is not applied and notes it", () => {
  const o = search({ ...base, category: "rental", budget: "xx" });
  assert.equal(o.results.length, LISTINGS.filter((l) => l.category === "rental").length);
  assert.equal(o.notes.length, 1);
});

test("area and category are hard filters", () => {
  const o = search({ ...base, area: "Sesvete" });
  assert.ok(o.results.every((r) => r.listing.area === "Sesvete"));
  const c = search({ ...base, category: "tools" });
  assert.ok(c.results.every((r) => r.listing.category === "tools"));
});

test("lexical match with inflection, works without profile", () => {
  const o = search({ ...base, intent: "trebam bušilicu" });
  assert.equal(o.results[0].listing.id, "demo-09");
  assert.ok(o.results[0].matchedFromIntent.length > 0);
});

test("profile used only when enabled", () => {
  const withP = search({ ...base, profile: "fotograf", useProfile: true });
  const without = search({ ...base, profile: "fotograf", useProfile: false });
  assert.ok(withP.results.some((r) => r.listing.id === "demo-12"));
  assert.equal(without.results.length, LISTINGS.length);
});

test("tokenize drops stopwords and diacritics", () => {
  assert.deepEqual(tokenize("Tražim stan u Trešnjevci"), ["stan", "tresnjevci"]);
});

test("draft is grounded and has no invented facts", () => {
  const d = buildDraft({ intent: "Tražim stan", profile: "Student", useProfile: true });
  assert.ok(d.includes("Tražim stan") && d.includes("Student"));
  assert.ok(d.includes("[upišite"));
  const n = buildDraft({ intent: "x", profile: "Student", useProfile: false });
  assert.ok(!n.includes("Student"));
});

test("saved store handles broken storage", () => {
  const bad = { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); } };
  const s = createSavedStore(bad);
  assert.ok(s.load().error);
  assert.ok(s.save(["a"]));
  const mem = new Map<string, string>();
  const ok = createSavedStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) });
  assert.equal(ok.save(["demo-01"]), null);
  assert.deepEqual(ok.load().ids, ["demo-01"]);
  mem.set("sma.search.saved.v1", "{bad");
  assert.ok(ok.load().error);
});
