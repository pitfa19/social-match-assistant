import test from "node:test";
import assert from "node:assert/strict";
import { buildRequest, parseProfileResponse, validateItems } from "./semanticProfile.ts";

const wrap = (obj: unknown, status = "completed") => ({
  status,
  output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(obj) }] }],
});
const item = (o: Record<string, unknown>) => ({ fact: "voli planinarenje", evidence: "Volim planinariti", topic: "sport", about_user: true, ...o });
const ans = "Volim planinariti vikendom. Ne volim buku.";

test("request is stored:false strict json_schema", () => {
  const r = buildRequest(1, ans) as any;
  assert.equal(r.store, false);
  assert.equal(r.text.format.strict, true);
  assert.match(r.input, /Volim planinariti/);
});
test("accepts grounded concise fact", () => {
  assert.deepEqual(parseProfileResponse(wrap({ items: [item({})] }), ans), [{ text: "voli planinarenje", topic: "sport" }]);
});
test("rejects evidence not in input", () => {
  assert.deepEqual(parseProfileResponse(wrap({ items: [item({ evidence: "volim jahati" })] }), ans), []);
});
test("drops facts about other people", () => {
  assert.deepEqual(validateItems({ items: [item({ about_user: false })] }, ans), []);
});
test("negation never becomes topic", () => {
  const r = validateItems({ items: [item({ fact: "ne voli buku", evidence: "Ne volim buku", topic: "glazba" })] }, ans);
  assert.deepEqual(r, [{ text: "ne voli buku", topic: "none" }]);
});
test("rejects fact that loses negation of its evidence", () => {
  assert.deepEqual(validateItems({ items: [item({ fact: "voli sport", evidence: "Ne volim sport", topic: "sport" })] }, "Ne volim sport."), []);
});
test("evidence must be exact quote: case and diacritics matter, whitespace and NFC do not", () => {
  assert.deepEqual(validateItems({ items: [item({ evidence: "volim planinariti" })] }, ans), []);
  assert.deepEqual(validateItems({ items: [item({ fact: "voli šetnje", evidence: "volim  šetnje" })] }, "Volim šetnje")?.length, 0);
  assert.equal(validateItems({ items: [item({ fact: "voli šetnje", evidence: "Volim\u00a0 šetnje".normalize("NFD") })] }, "Volim šetnje")?.length, 1);
});
test("request sets low reasoning and generous token budget", () => {
  const r = buildRequest(0, ans) as any;
  assert.equal(r.reasoning.effort, "low");
  assert.ok(r.max_output_tokens >= 1000);
});
test("bad schema, refusal, incomplete, bad JSON are errors", () => {
  assert.equal(parseProfileResponse(wrap({ items: "x" }), ans), null);
  assert.equal(parseProfileResponse(wrap({ items: [item({ topic: "bogus" })] }), ans), null);
  assert.equal(parseProfileResponse(wrap({ items: [] }, "incomplete"), ans), null);
  assert.equal(parseProfileResponse({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }, ans), null);
  assert.equal(parseProfileResponse({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "{" }] }] }, ans), null);
  assert.equal(parseProfileResponse(null, ans), null);
});
test("caps count and length, dedupes", () => {
  assert.equal(validateItems({ items: Array(7).fill(item({})) }, ans), null);
  assert.deepEqual(validateItems({ items: [item({ fact: "x".repeat(81) }), item({}), item({})] }, ans)?.length, 1);
});
