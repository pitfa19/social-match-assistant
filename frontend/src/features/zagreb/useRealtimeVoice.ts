"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TurnController, type ControllerState } from "./realtimeTurnController";
import { REALTIME, realtimeUrl, toBase64, voiceError, type VoiceError, type VoiceErrorKind } from "./realtimeVoiceLogic";

export type RealtimeState = "idle" | "starting" | "listening" | "paused" | "error";

interface Options {
  /**
   * Called once per silence-committed answer. Routing is paused until the returned promise
   * settles, then resumes automatically. Never called for stale, duplicate or empty text.
   */
  onFinal: (text: string) => void | Promise<unknown>;
  onError?: (e: VoiceError) => void;
}

/**
 * Continuous ElevenLabs Scribe realtime capture (single-use token, server VAD 1.5 s).
 * The pause/flush protocol lives in TurnController and is unit tested there. Never plays audio.
 */
export function useRealtimeVoice({ onFinal, onError }: Options) {
  const [state, setState] = useState<RealtimeState>("idle");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<VoiceError | null>(null);

  const cbFinal = useRef(onFinal);
  const cbError = useRef(onError);
  cbFinal.current = onFinal;
  cbError.current = onError;

  const gen = useRef(0); // bumps on every start/stop/fail; stale async work compares against it
  const startingRef = useRef(false); // synchronous guard, set before any await
  const alive = useRef(true);
  const controller = useRef<TurnController | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const node = useRef<AudioWorkletNode | null>(null);
  const timers = useRef<number[]>([]);

  const teardown = useCallback(() => {
    startingRef.current = false;
    timers.current.forEach((t) => { window.clearTimeout(t); window.clearInterval(t); });
    timers.current = [];
    controller.current?.stop();
    controller.current = null;
    const w = ws.current;
    ws.current = null;
    if (w) {
      w.onopen = w.onmessage = w.onerror = w.onclose = null;
      try { w.close(); } catch { /* ignore */ }
    }
    if (node.current) {
      node.current.port.onmessage = null;
      try { node.current.disconnect(); } catch { /* ignore */ }
      node.current = null;
    }
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    const c = ctx.current;
    ctx.current = null;
    if (c && c.state !== "closed") void c.close().catch(() => undefined);
  }, []);

  const fail = useCallback((kind: VoiceErrorKind, myGen: number) => {
    if (myGen !== gen.current) return;
    gen.current += 1;
    teardown();
    const e = voiceError(kind);
    if (alive.current) {
      setError(e);
      setPartial("");
      setState("error");
      cbError.current?.(e);
    }
  }, [teardown]);

  const stop = useCallback(() => {
    gen.current += 1;
    teardown();
    if (alive.current) {
      setPartial("");
      setState("idle");
    }
  }, [teardown]);

  const start = useCallback(async () => {
    if (startingRef.current || controller.current) return; // sync: blocks double click in one render
    startingRef.current = true;
    if (
      typeof WebSocket === "undefined" || typeof AudioWorkletNode === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      startingRef.current = false;
      const e = voiceError("unsupported");
      setError(e); setState("error"); cbError.current?.(e);
      return;
    }
    const myGen = ++gen.current;
    const stale = () => !alive.current || myGen !== gen.current;
    setError(null);
    setPartial("");
    setState("starting");

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch {
      fail("permission", myGen);
      return;
    }
    if (stale()) { mic.getTracks().forEach((t) => t.stop()); return; }
    stream.current = mic;

    let token: string;
    try {
      const res = await fetch("/api/zagreb/realtime-token", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(REALTIME.handshakeMs),
      });
      if (!res.ok) throw new Error("token");
      const data = (await res.json()) as { token?: unknown };
      if (typeof data.token !== "string" || !data.token) throw new Error("token");
      token = data.token;
    } catch {
      fail("token", myGen);
      return;
    }
    if (stale()) return;

    let worklet: AudioWorkletNode;
    try {
      // Created here so the context is wired up before audio starts; resumed explicitly below
      // because async hops after the click can leave it suspended.
      const ac = new AudioContext();
      ctx.current = ac;
      await ac.audioWorklet.addModule("/audio/pcm-worklet.js");
      if (stale()) return;
      const src = ac.createMediaStreamSource(mic);
      // The worklet has no outputs (nothing is ever played). It is kept alive and rendered
      // because it is connected to an input source; process() runs for it every quantum.
      worklet = new AudioWorkletNode(ac, "pcm-capture", { numberOfInputs: 1, numberOfOutputs: 0 });
      src.connect(worklet);
      node.current = worklet;
      if (ac.state !== "running") await ac.resume();
      if (stale()) return;
      if (ac.state !== "running") throw new Error("suspended");
    } catch {
      fail("unsupported", myGen);
      return;
    }

    const socket = new WebSocket(realtimeUrl(token));
    ws.current = socket;
    const ctl = new TurnController({
      send: (m) => { if (socket.readyState === WebSocket.OPEN) socket.send(m); },
      onFinal: (text) => cbFinal.current(text),
      onPartial: (t) => { if (!stale()) setPartial(t); },
      onState: (s: ControllerState) => {
        if (stale()) return;
        if (s === "listening" || s === "paused" || s === "starting") setState(s);
      },
      onFail: (k) => fail(k, myGen),
      now: () => performance.now(),
    });
    controller.current = ctl;

    worklet.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
      if (stale()) return;
      ctl.onAudio(toBase64(new Uint8Array(ev.data)));
    };
    socket.onmessage = (ev) => {
      if (stale() || typeof ev.data !== "string") return;
      let m: { message_type?: string; text?: string };
      try { m = JSON.parse(ev.data); } catch { return; }
      ctl.onMessage(m);
    };
    socket.onerror = () => fail("network", myGen);
    socket.onclose = () => fail("network", myGen);

    timers.current.push(window.setTimeout(() => {
      if (!stale() && ctl.state === "starting") fail("network", myGen); // never got session_started
    }, REALTIME.handshakeMs));
    timers.current.push(window.setTimeout(() => fail("timeout", myGen), REALTIME.maxSessionMs));
    timers.current.push(window.setInterval(() => {
      if (stale()) return;
      if (ctl.isListening && performance.now() - ctl.lastSpeechAt > REALTIME.idleMs) fail("idle", myGen);
    }, 5000));
  }, [fail]);

  /** Optional manual pause on top of the automatic one around onFinal. */
  const setSuspended = useCallback((suspended: boolean) => {
    controller.current?.setSuspended(suspended);
  }, []);

  useEffect(() => {
    alive.current = true;
    const onHide = () => {
      if (document.visibilityState === "hidden" && (controller.current || startingRef.current)) fail("hidden", gen.current);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", stop);
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", stop);
      gen.current += 1;
      teardown();
    };
  }, [fail, stop, teardown]);

  return {
    state, partial, error, start, stop, setSuspended,
    suspended: state === "paused",
    active: state === "listening" || state === "paused" || state === "starting",
  };
}
