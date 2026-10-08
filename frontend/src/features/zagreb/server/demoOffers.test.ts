import test from "node:test";
import assert from "node:assert/strict";
import { matchDemoOffers } from "./demoOffers.ts";
import type { MatchInput } from "./indexedMatches.ts";
import { findNeighbourhood } from "../neighbourhoods.ts";

const input = (texts: string[], role: "request" | "offer" | "interest" | "description" = "request", areaId = "tresnjevka"): MatchInput =>
  ({ areaId, cityWide: false, facts: texts.map((text) => ({ text, role })) });
const ids = (i: MatchInput) => matchDemoOffers(i).map((c) => c.id);

test("area id is the canonical catalogue Trešnjevka id", () => {
  assert.ok(findNeighbourhood("tresnjevka"));
  for (const c of matchDemoOffers(input(["trebam nekoga za šetanje psa i popravak cijevi"]))) assert.equal(c.area, "tresnjevka");
});

test("dog walking phrasing, accented and ascii", () => {
  for (const t of ["Tražim nekoga tko će mi prošetati psa", "trazim nekoga tko ce mi prosetat psa",
    "treba mi šetač pasa", "treba mi setac za psa", "trebam šetnju za psa", "need dog walking"]) {
    assert.deepEqual(ids(input([t])), ["demo-dog-walking-tresnjevka"], t);
  }
});

test("pipe repair phrasing, accented and ascii", () => {
  for (const t of ["treba mi popraviti cijev u stanu", "trebam popravak cijevi", "curi mi cijev", "popraviti cijev u stanu",
    "trazim vodoinstalatera", "pukla mi je cijev"]) {
    assert.deepEqual(ids(input([t])), ["demo-pipe-repair-tresnjevka"], t);
  }
});

test("combined needs return both, separate and stable", () => {
  const r = matchDemoOffers(input(["tražim nekoga tko će mi prošetati psa i popraviti cijev u stanu"]));
  assert.deepEqual(r.map((c) => c.id).sort(), ["demo-dog-walking-tresnjevka", "demo-pipe-repair-tresnjevka"]);
  const split = ids(input(["trebam šetača psa", "trebam popraviti cijev"]));
  assert.equal(split.length, 2);
});

test("microphone request matches rental, not music alone, purchase, negation or wrong area", () => {
  for (const text of ["Tražim mikrofon", "trazim mikrofon za rent", "Trebam najam mikrofona", "mikrofon za snimanje vokala"]) {
    assert.deepEqual(ids(input([text])), ["demo-microphone-rental-tresnjevka"]);
  }
  for (const text of ["Želim kupiti mikrofon", "ne trebam mikrofon", "tražim glazbu"]) assert.deepEqual(ids(input([text])), []);
  assert.deepEqual(ids(input(["mikrofon"], "interest")), []);
  assert.deepEqual(ids(input(["mikrofon"], "offer")), []);
  assert.deepEqual(ids(input(["mikrofon"], "request", "maksimir")), []);
  assert.equal(matchDemoOffers(input(["Tražim nekoga da prošetat psa i popraviti cijev u stanu, tražim i mikrofon"])).length, 3);
});

test("candidates retain synthetic metadata without visible demo wording or contact links", () => {
  for (const c of matchDemoOffers(input(["šetnja psa", "popravak cijevi", "mikrofon"]))) {
    assert.ok(c.id.startsWith("demo-"));
    assert.equal(c.source, "demo");
    assert.equal(c.url, null);
    assert.equal(c.areaBasis, "structured");
    assert.equal(c.recordKind, "synthetic");
    assert.doesNotMatch(c.title + c.body, /demo|izmišljen|sintetičk|nije stvarna/i);
    assert.doesNotMatch(c.title + c.body, /@|https?:|\+?\d{6,}/);
  }
});

test("does not match biography, music or offer facts", () => {
  assert.deepEqual(ids(input(["gradski treper"], "description")), []);
  assert.deepEqual(ids(input(["zanima me glazba"], "interest")), []);
  assert.deepEqual(ids(input(["živim na Trešnjevci"], "description")), []);
  assert.deepEqual(ids(input(["nudim šetanje pasa i popravak cijevi"], "offer")), []);
  assert.deepEqual(ids(input(["šetam psa", "popravljam cijevi"], "description")), []);
  assert.deepEqual(ids(input(["trazim nekoga za glazbu i druženje"])), []);
});

test("generic stan words alone do not match", () => {
  assert.deepEqual(ids(input(["tražim stan", "živim u stanu", "trebam pomoć u stanu"])), []);
  assert.deepEqual(ids(input(["volim pse", "imam psa"])), []);
});

test("unrelated area and non-Trešnjevka ids do not match", () => {
  assert.deepEqual(ids(input(["šetanje psa, popravak cijevi"], "request", "maksimir")), []);
  assert.deepEqual(ids(input(["šetanje psa"], "request", "mo-stara-tresnjevka")), []);
});

test("negated requests do not match, but a positive sibling clause still does", () => {
  assert.deepEqual(ids(input(["ne trebam šetača za psa"])), []);
  assert.deepEqual(ids(input(["nije mi potreban popravak cijevi"])), []);
  assert.deepEqual(ids(input(["ne treba mi nitko za cijev, ali trebam šetača psa"])), ["demo-dog-walking-tresnjevka"]);
});

test("no facts, no results, and returned objects are fresh copies", () => {
  assert.deepEqual(matchDemoOffers(input([])), []);
  const a = matchDemoOffers(input(["šetanje psa"]));
  a[0].unknown.push("x");
  assert.equal(matchDemoOffers(input(["šetanje psa"]))[0].unknown.length, 2);
});
