"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecState = "idle" | "requesting" | "recording" | "unavailable";

const MAX_MS = 12_000;
const MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/** Records one short clip and resolves with its Blob. Silent: never plays audio. */
export function useRecorder(onClip: (blob: Blob) => void) {
  const [state, setState] = useState<RecState>("idle");
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const cb = useRef(onClip);
  cb.current = onClip;
  const alive = useRef(true);
  const gen = useRef(0);
  const starting = useRef(false);

  const release = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      gen.current += 1;
      const r = rec.current;
      if (r) {
        r.onstop = null;
        if (r.state !== "inactive") r.stop();
      }
      rec.current = null;
      release();
    };
  }, [release]);

  const stop = useCallback(() => {
    const r = rec.current;
    if (r && r.state !== "inactive") r.stop();
  }, []);

  const start = useCallback(async () => {
    if (rec.current || starting.current) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return;
    }
    setState("requesting");
    starting.current = true;
    const myGen = ++gen.current;
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      starting.current = false;
      if (alive.current && myGen === gen.current) setState("unavailable");
      return;
    }
    starting.current = false;
    if (!alive.current || myGen !== gen.current) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    stream.current = s;
    let r: MediaRecorder;
    const mime = MIMES.find((m) => MediaRecorder.isTypeSupported?.(m));
    try {
      r = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
    } catch {
      release();
      setState("unavailable");
      return;
    }
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    r.onstop = () => {
      release();
      rec.current = null;
      const blob = new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" });
      chunks.current = [];
      if (!alive.current) return;
      setState("idle");
      if (blob.size > 0) cb.current(blob);
    };
    r.onerror = () => {
      r.onstop = null;
      rec.current = null;
      chunks.current = [];
      release();
      if (alive.current) setState("idle");
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      rec.current = null;
      release();
      setState("unavailable");
      return;
    }
    setState("recording");
    timer.current = window.setTimeout(stop, MAX_MS);
  }, [release, stop]);

  /** Abort without delivering a clip and release the microphone. */
  const cancel = useCallback(() => {
    gen.current += 1;
    starting.current = false;
    const r = rec.current;
    if (r) {
      r.onstop = null;
      if (r.state !== "inactive") r.stop();
    }
    rec.current = null;
    chunks.current = [];
    release();
    setState("idle");
  }, [release]);

  return { state, start, stop, cancel };
}
