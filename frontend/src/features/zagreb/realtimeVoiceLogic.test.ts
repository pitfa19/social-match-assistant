import test from "node:test";
import assert from "node:assert/strict";
import { TurnGate, classifyServerEvent, realtimeUrl, audioChunkMessage, toBase64, normalize } from "./realtimeVoiceLogic.ts";

test("delivers a normal commit", () => {
  const g = new TurnGate();
  assert.deepEqual(g.onCommitted("Tražim stan u Trešnjevci.", 0), { deliver: "Tražim stan u Trešnjevci." });
});

test("silence alone never submits", () => {
  const g = new TurnGate();
  assert.equal(g.onCommitted("", 0).deliver, null);
  assert.equal(g.onCommitted("  ...  ", 10).deliver, null);
  assert.equal(g.onCommitted("a", 20).deliver, null);
});

test("commits while suspended are dropped", () => {
  const g = new TurnGate();
  g.suspend(0);
  assert.deepEqual(g.onCommitted("flush reply", 50), { deliver: null, reason: "flushing" });
  assert.deepEqual(g.onCommitted("kasni tekst", 100), { deliver: null, reason: "suspended" });
});

test("trailing duplicate of the same answer is dropped", () => {
  const g = new TurnGate();
  assert.ok(g.onCommitted("Volim glazbu", 0).deliver);
  assert.equal(g.onCommitted("volim glazbu!", 1000).deliver, null);
  assert.ok(g.onCommitted("volim glazbu", 5000).deliver, "outside the window it is a new answer");
});

test("suspend with buffered speech flushes and swallows the flush commit", () => {
  const g = new TurnGate();
  g.onPartial("pola reče");
  assert.equal(g.suspend(0), true);
  assert.equal(g.state, "flushing");
  g.resume(100); // requested while flushing
  assert.equal(g.canStreamAudio(200), false);
  assert.deepEqual(g.onCommitted("pola rečenice", 300), { deliver: null, reason: "flushing" });
  assert.equal(g.state, "listening");
  assert.equal(g.canStreamAudio(400), true);
  assert.ok(g.onCommitted("sljedeće pitanje", 500).deliver);
});

test("flush timeout releases a resume even if no commit arrives", () => {
  const g = new TurnGate({ flushTimeoutMs: 1000 });
  g.onPartial("nešto");
  g.suspend(0);
  g.resume(10);
  assert.equal(g.canStreamAudio(500), false);
  assert.equal(g.canStreamAudio(1001), true);
});

test("suspend always flushes, even with no partial seen (speech may be in flight)", () => {
  const g = new TurnGate({ flushTimeoutMs: 1000 });
  assert.equal(g.suspend(0), true);
  g.resume(2);
  assert.equal(g.canStreamAudio(3), false, "resume waits for the flush to settle");
  assert.equal(g.canStreamAudio(1001), true, "silence: timeout settles the flush");
});

test("resume is not remembered across a fresh suspend", () => {
  const g = new TurnGate();
  g.onPartial("x y");
  g.suspend(0);
  g.resume(1);
  g.onCommitted("x y", 2);
  g.suspend(3);
  assert.equal(g.canStreamAudio(4), false);
});

test("server events are classified", () => {
  assert.equal(classifyServerEvent("auth_error"), "token");
  assert.equal(classifyServerEvent("quota_exceeded"), "quota");
  assert.equal(classifyServerEvent("session_time_limit_exceeded"), "timeout");
  assert.equal(classifyServerEvent("transcriber_error"), "server");
  assert.equal(classifyServerEvent("insufficient_audio_activity"), null);
  assert.equal(classifyServerEvent("partial_transcript"), null);
});

test("url carries VAD 1.5 s, Croatian and a token, never an api key", () => {
  const u = new URL(realtimeUrl("sutkn_x"));
  assert.equal(u.searchParams.get("commit_strategy"), "vad");
  assert.equal(u.searchParams.get("vad_silence_threshold_secs"), "1.5");
  assert.equal(u.searchParams.get("language_code"), "hr");
  assert.equal(u.searchParams.get("token"), "sutkn_x");
  assert.equal(u.searchParams.get("audio_format"), "pcm_16000");
  assert.ok(!u.toString().includes("xi-api-key"));
});

test("audio chunk message follows the documented shape", () => {
  const m = JSON.parse(audioChunkMessage(toBase64(new Uint8Array([1, 2, 3])), true));
  assert.deepEqual(Object.keys(m).sort(), ["audio_base_64", "commit", "message_type", "sample_rate"]);
  assert.equal(m.message_type, "input_audio_chunk");
  assert.equal(m.commit, true);
  assert.equal(m.sample_rate, 16000);
});

test("normalize strips punctuation and case", () => {
  assert.equal(normalize("  Dobro, hvala!  "), "dobro hvala");
});
