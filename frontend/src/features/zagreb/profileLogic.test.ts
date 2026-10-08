import test from "node:test";
import assert from "node:assert/strict";
import {
  QUESTIONS, candidateClauses, isNegated, applyAnswer, removeNote, initialState, isBlank, mapDecisions, noteKey, finish,
} from "./profileLogic.ts";

test("questions come in the approved order", () => {
  assert.deepEqual([...QUESTIONS], [
    "Kako bi se opisao?",
    "Što te zanima?",
    "Što trenutno tražiš ili možeš ponuditi?",
    "Koji kvart te zanima?",
  ]);
});

test("blank answers do not advance", () => {
  assert.ok(isBlank("   ") && isBlank("...") && !isBlank("a"));
  // The UI gates on isBlank, and applyAnswer ignores stale steps.
  const s = applyAnswer(initialState, 1, [{ text: "x", topic: "sport" }]);
  assert.equal(s, initialState);
});

test("clauses are verbatim sentences, never truncated, capped in count", () => {
  const c = candidateClauses("Volim trčati po Jarunu. Radim kao programer; imam psa, i volim kavu");
  assert.deepEqual(c, ["Volim trčati po Jarunu", "Radim kao programer", "imam psa, i volim kavu"]);
  const long = "Volim " + "riječ ".repeat(100) + "ali ne volim sport";
  assert.deepEqual(candidateClauses(long + ". Volim glazbu"), ["Volim glazbu"]);
  assert.ok(candidateClauses("a. ".repeat(50) + "riječ ".repeat(40)).length <= 6);
});

test("negated clauses stay as facts, never split from their negation", () => {
  assert.ok(isNegated("Ne volim sport"));
  assert.ok(!isNegated("Nedjeljom trčim"));
  assert.deepEqual(candidateClauses("Ne volim nogomet. Volim glazbu."), ["Ne volim nogomet", "Volim glazbu"]);
  assert.deepEqual(candidateClauses("Nemam auto, ali tražim bicikl"), ["Nemam auto, ali tražim bicikl"]);
});

test("negative self fact is kept without a positive sport topic", () => {
  const clauses = candidateClauses("Ne volim nogomet. Volim glazbu.");
  const out = mapDecisions(clauses, [
    { name: "s0", type: "predicate", probability: 0.9 },
    { name: "c0", type: "choice", choice: "sport", confidence: 0.95 },
    { name: "s1", type: "predicate", probability: 0.95 },
    { name: "c1", type: "choice", choice: "glazba", confidence: 0.95 },
  ]);
  assert.deepEqual(out, [
    { text: "Ne volim nogomet", topic: "none" },
    { text: "Volim glazbu", topic: "glazba" },
  ]);
  const s = applyAnswer(initialState, 0, out);
  assert.deepEqual(s.notes.map((n) => n.text), ["Ne volim nogomet", "Volim glazbu", "Glazba"]);
});

test("mapDecisions: self predicate gates clauses, topic none keeps fact untagged, bad topics dropped", () => {
  const clauses = ["Volim trčati", "Moja sestra voli tenis", "Radim kao programer", "Pozdrav"];
  const out = mapDecisions(clauses, [
    { name: "s0", type: "predicate", probability: 0.95 },
    { name: "c0", type: "choice", choice: "sport", confidence: 0.9 },
    { name: "s1", type: "predicate", probability: 0.05 },
    { name: "c1", type: "choice", choice: "sport", confidence: 0.99 },
    { name: "s2", type: "predicate", probability: 0.9 },
    { name: "c2", type: "choice", choice: "invented", confidence: 0.99 },
    { name: "s3", type: "predicate", probability: 0.2 },
    { name: "s9", type: "predicate", probability: 0.99 },
  ]);
  assert.deepEqual(out, [
    { text: "Volim trčati", topic: "sport" },
    { text: "Radim kao programer", topic: "none" },
  ]);
});

test("facts and topics are added and advance the step; duplicates collapse", () => {
  let s = applyAnswer(initialState, 0, [{ text: "Volim trčati", topic: "sport" }, { text: "Volim planinarenje", topic: "sport" }]);
  assert.equal(s.step, 1);
  assert.deepEqual(s.notes.map((n) => n.kind), ["fact", "topic", "fact"]);
});

test("deleted items never come back through later answers", () => {
  let s = applyAnswer(initialState, 0, [{ text: "Volim trčati", topic: "sport" }]);
  s = removeNote(s, noteKey("topic", "sport"));
  s = removeNote(s, noteKey("fact", "Volim trčati"));
  assert.equal(s.notes.length, 0);
  s = applyAnswer(s, 1, [{ text: "volim trčati!", topic: "sport" }, { text: "Volim glazbu", topic: "glazba" }]);
  assert.deepEqual(s.notes.map((n) => n.key), [noteKey("fact", "Volim glazbu"), noteKey("topic", "glazba")]);
  s = applyAnswer(s, 2, []);
  assert.equal(s.step, 3);
  assert.equal(s.notes.length, 2);
  assert.equal(finish(s).step, 4);
});
