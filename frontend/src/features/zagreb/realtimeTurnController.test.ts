import test from "node:test";
import assert from "node:assert/strict";
import { TurnController } from "./realtimeTurnController.ts";

// Scripted fake of the Scribe realtime server. It records every client frame and lets a test
// inject server events at exact points.
function rig(gate = { flushTimeoutMs: 1000 }) {
  let t = 0;
  const sent: { commit: boolean; silent: boolean }[] = [];
  const finals: string[] = [];
  const partials: string[] = [];
  const states: string[] = [];
  const fails: string[] = [];
  const pending: { resolve: () => void; reject: (e: unknown) => void }[] = [];
  const c = new TurnController({
    now: () => t,
    gate,
    send: (m) => {
      const j = JSON.parse(m);
      sent.push({ commit: j.commit, silent: /^A+=*$/.test(j.audio_base_64) });
    },
    onFinal: (text) => {
      finals.push(text);
      return new Promise<void>((resolve, reject) => pending.push({ resolve, reject }));
    },
    onPartial: (p) => partials.push(p),
    onState: (s) => states.push(s),
    onFail: (k) => fails.push(k),
  });
  const server = {
    ready: () => c.onMessage({ message_type: "session_started" }),
    partial: (text: string) => c.onMessage({ message_type: "partial_transcript", text }),
    commit: (text: string) => c.onMessage({ message_type: "committed_transcript", text }),
  };
  const mic = () => c.onAudio("AQID"); // non-silent frame
  const tick = (ms: number) => { t += ms; };
  const settle = async () => { pending.shift()!.resolve(); await Promise.resolve(); await Promise.resolve(); };
  return { c, server, mic, tick, settle, sent, finals, partials, states, fails, pending };
}

test("EVIDENCE: trailing commit of the same answer after pause is never delivered as the next question", async () => {
  const r = rig();
  r.server.ready();
  r.server.partial("tražim stan");
  r.server.commit("Tražim stan.");
  assert.deepEqual(r.finals, ["Tražim stan."]);
  assert.equal(r.c.state, "paused");
  // user keeps talking while the LLM works: only silence goes upstream
  r.mic(); r.mic();
  assert.ok(r.sent.slice(-2).every((f) => f.silent), "mic audio must not be uploaded while paused");
  // exactly one flush commit was sent on pause
  assert.equal(r.sent.filter((f) => f.commit).length, 1);
  // server closes the in-flight segment with trailing speech
  r.server.commit("u Trešnjevci");
  assert.deepEqual(r.finals, ["Tražim stan."], "trailing text swallowed");
  // handler finishes, listening resumes without a click
  await r.settle();
  assert.equal(r.c.state, "listening");
  r.mic();
  assert.equal(r.sent.at(-1)!.silent, false, "audio flows again after resume");
  r.server.commit("Koliko košta najam?");
  assert.deepEqual(r.finals, ["Tražim stan.", "Koliko košta najam?"]);
});

test("EVIDENCE: flush commit arriving AFTER the handler settled is still swallowed (resume waits)", async () => {
  const r = rig();
  r.server.ready();
  r.server.commit("Prvi odgovor");
  await r.settle(); // LLM done before the flush reply arrived
  assert.equal(r.c.state, "paused", "resume deferred until flush settles");
  r.server.commit("ostatak prvog odgovora");
  assert.deepEqual(r.finals, ["Prvi odgovor"]);
  assert.equal(r.c.state, "listening");
  r.server.commit("Drugi odgovor");
  assert.deepEqual(r.finals, ["Prvi odgovor", "Drugi odgovor"]);
});

test("flush never answered (no speech in flight): timeout settles it, no hang", async () => {
  const r = rig();
  r.server.ready();
  r.server.commit("Odgovor");
  await r.settle();
  assert.equal(r.c.state, "paused");
  r.tick(1001);
  r.mic(); // next frame observes the deadline
  assert.equal(r.c.state, "listening");
});

test("stale final: commit during a long handler is dropped, not queued", async () => {
  const r = rig();
  r.server.ready();
  r.server.commit("Prvo pitanje");
  r.server.commit("Drugo pitanje prerano"); // flush reply, swallowed
  r.server.commit("Treće pitanje"); // arrives while still paused
  assert.deepEqual(r.finals, ["Prvo pitanje"]);
  await r.settle();
  r.tick(5);
  r.server.commit("Čisto novo pitanje");
  assert.deepEqual(r.finals, ["Prvo pitanje", "Čisto novo pitanje"]);
});

test("duplicate final inside the window is dropped", async () => {
  const r = rig();
  r.server.ready();
  r.server.commit("Volim glazbu");
  r.server.commit("flush");
  await r.settle();
  r.tick(100);
  r.server.commit("volim glazbu!");
  assert.deepEqual(r.finals, ["Volim glazbu"]);
});

test("stop during awaited callback: no resume, no further delivery, no more frames", async () => {
  const r = rig();
  r.server.ready();
  r.server.commit("Pitanje");
  r.c.stop();
  assert.equal(r.c.state, "stopped");
  const before = r.sent.length;
  await r.settle(); // handler resolves after stop
  assert.equal(r.c.state, "stopped", "late resolve must not revive the session");
  r.mic();
  r.server.commit("kasni tekst");
  r.server.partial("kasno");
  assert.equal(r.sent.length, before, "no frames after stop");
  assert.deepEqual(r.finals, ["Pitanje"]);
  r.c.stop(); // idempotent
});

test("handler rejection still resumes", async () => {
  const r = rig();
  r.server.ready();
  r.server.commit("Pitanje");
  r.server.commit("flush");
  r.pending.shift()!.reject(new Error("llm down"));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(r.c.state, "listening");
});

test("silence / no speech never submits", () => {
  const r = rig();
  r.server.ready();
  r.server.partial("");
  r.server.commit("");
  r.server.commit("   ");
  r.server.commit("m");
  r.server.commit("...");
  assert.deepEqual(r.finals, []);
  assert.equal(r.c.state, "listening");
  assert.equal(r.sent.filter((f) => f.commit).length, 0, "no flush without a turn");
});

test("manual pause holds past handler completion until released", async () => {
  const r = rig();
  r.server.ready();
  r.server.commit("Pitanje");
  r.c.setSuspended(true);
  r.server.commit("flush");
  await r.settle();
  assert.equal(r.c.state, "paused");
  r.c.setSuspended(false);
  assert.equal(r.c.state, "listening");
});

test("frames before session_started are not sent", () => {
  const r = rig();
  r.mic();
  assert.equal(r.sent.length, 0);
});

test("server error events surface typed failures", () => {
  const r = rig();
  r.server.ready();
  r.c.onMessage({ message_type: "quota_exceeded" });
  r.c.onMessage({ message_type: "insufficient_audio_activity" });
  assert.deepEqual(r.fails, ["quota"]);
});
