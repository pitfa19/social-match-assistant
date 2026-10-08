import test from "node:test";
import assert from "node:assert/strict";
import { withLocalDemoOffers } from "./devDemoMatches.ts";
import type { MatchResponse } from "../indexedSearch.ts";
import type { MatchInput } from "./indexedMatches.ts";

const input: MatchInput = { areaId: "tresnjevka", cityWide: false, facts: [
  { text: "Gradski treper", role: "description" },
  { text: "Zanima me glazba", role: "interest" },
  { text: "Tražim nekoga tko će mi prošetat psa i popraviti cijev u stanu", role: "request" },
] };
const empty: MatchResponse = { results: [], sources: [], searched: true, truncated: false,
  indexAvailable: true, sourcesAvailable: true };

test("demo offers require both development and explicit opt-in", () => {
  for (const env of [{}, { NODE_ENV: "development" }, { NODE_ENV: "production", LOCAL_DEMO_OFFERS: "1" },
    { NODE_ENV: "test", LOCAL_DEMO_OFFERS: "1" }, { NODE_ENV: "development", LOCAL_DEMO_OFFERS: "0" }]) {
    assert.equal(withLocalDemoOffers(input, empty, env), empty);
  }
  const result = withLocalDemoOffers(input, empty, { NODE_ENV: "development", LOCAL_DEMO_OFFERS: "1" });
  assert.equal(result.results.length, 2);
  assert.ok(result.results.every(r => r.source === "demo" && r.url === null && r.area === "tresnjevka"));
  assert.deepEqual(empty.results, []);
});

test("overlay preserves backend availability truth and original real records", () => {
  const real = { id: "real-1", title: "Existing", body: "Original", source: "facebook", url: null,
    area: "tresnjevka", areaBasis: "explicit_text" as const, unknown: [] };
  const base = { ...empty, results: [real], indexAvailable: false };
  const result = withLocalDemoOffers(input, base, { NODE_ENV: "development", LOCAL_DEMO_OFFERS: "1" });
  assert.equal(result.indexAvailable, false);
  assert.equal(result.results[2], real);
  assert.deepEqual(base.results, [real]);
});

test("hosted production demo requires its own explicit server opt-in", () => {
  for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "production", HOSTED_DEMO_OFFERS: "0" },
    { NODE_ENV: "production", HOSTED_DEMO_OFFERS: "true" }, { NODE_ENV: "test", HOSTED_DEMO_OFFERS: "1" },
    { NODE_ENV: "development", HOSTED_DEMO_OFFERS: "1" }]) {
    assert.equal(withLocalDemoOffers(input, empty, env), empty);
  }
  const result = withLocalDemoOffers({ ...input, facts: [...input.facts, { role: "request", text: "Tražim mikrofon" }] },
    empty, { NODE_ENV: "production", HOSTED_DEMO_OFFERS: "1" });
  assert.equal(result.results.length, 3);
  assert.ok(result.results.every(r => r.source === "demo" && r.area === "tresnjevka" && r.url === null));
});

test("wrong area adds nothing and result cap remains honest", () => {
  const env = { NODE_ENV: "development", LOCAL_DEMO_OFFERS: "1" };
  assert.equal(withLocalDemoOffers({ ...input, areaId: "maksimir" }, empty, env), empty);
  const real = Array.from({ length: 12 }, (_, i) => ({ id: `real-${i}`, title: "Real", body: "Real", source: "facebook",
    url: null, area: "tresnjevka", areaBasis: "structured" as const, unknown: [] }));
  const result = withLocalDemoOffers(input, { ...empty, results: real }, env);
  assert.equal(result.results.length, 12);
  assert.equal(result.results.filter(r => r.source === "demo").length, 2);
  assert.equal(result.truncated, true);
});
