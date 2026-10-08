"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ZagrebMap, type MapTarget } from "./ZagrebMap";
import { findNeighbourhood } from "./neighbourhoods";
import { useRecorder } from "./useRecorder";
import styles from "./Zagreb.module.css";

type Phase = "idle" | "ready" | "thinking" | "clarify" | "error";

export function ZagrebHome() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [rect, setRect] = useState<{ t: number; r: number; b: number; l: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState("");
  const [target, setTarget] = useState<MapTarget | null>(null);
  const [placeName, setPlaceName] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [showSearchNote, setShowSearchNote] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  const closeRef = useRef<() => void>(() => {});

  const decide = useCallback(async (text: string) => {
    setPhase("thinking");
    setNotice("");
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/zagreb/neighbourhood", {
        signal: ac.signal,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as { status?: string; id?: string; error?: string };
      if (!res.ok) {
        setNotice(data.error || "Pokušaj ponovno ili upiši kvart.");
        setPhase("error");
        return;
      }
      const hit = data.status === "selected" && data.id ? findNeighbourhood(data.id) : undefined;
      if (!hit) {
        setNotice("Nisam siguran koji kvart misliš. Navedi ga imenom.");
        setPhase("clarify");
        return;
      }
      setPlaceName(hit.name);
      setSelectedId(hit.id);
      setTarget({ lat: hit.lat, lng: hit.lng, zoom: hit.zoom });
      closeRef.current();
      setPhase("ready");
    } catch {
      if (ac.signal.aborted) return;
      setNotice("Nema veze. Pokušaj ponovno ili upiši kvart.");
      setPhase("error");
    }
  }, []);

  const transcribe = useCallback(
    async (blob: Blob) => {
      setPhase("thinking");
      setNotice("");
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const fd = new FormData();
        fd.set("audio", blob, "snimka");
        const res = await fetch("/api/zagreb/transcribe", { method: "POST", body: fd, signal: ac.signal });
        const data = (await res.json()) as { text?: string; error?: string };
        if (!res.ok || !data.text) {
          setNotice(data.error || "Nisam te razumio. Pokušaj ponovno ili upiši kvart.");
          setPhase("error");
          return;
        }
        setTyped(data.text);
        await decide(data.text);
      } catch {
        if (ac.signal.aborted) return;
        setNotice("Nema veze. Pokušaj ponovno ili upiši kvart.");
        setPhase("error");
      }
    },
    [decide],
  );

  const recorder = useRecorder(transcribe);
  const { cancel: cancelRecording } = recorder;

  const closeOverlay = useCallback(() => {
    abortRef.current?.abort();
    cancelRecording();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pill = openerRef.current?.getBoundingClientRect();
    if (pill) setRect({ t: pill.top, r: window.innerWidth - pill.right, b: window.innerHeight - pill.bottom, l: pill.left });
    setExpanded(false);
    if (reduce) setOpen(false);
    else window.setTimeout(() => setOpen(false), 560);
  }, [cancelRecording]);
  closeRef.current = closeOverlay;

  const openOverlay = useCallback(() => {
    const pill = openerRef.current?.getBoundingClientRect();
    if (pill) setRect({ t: pill.top, r: window.innerWidth - pill.right, b: window.innerHeight - pill.bottom, l: pill.left });
    setPhase("ready");
    setNotice("");
    setTyped("");
    setOpen(true);
  }, []);

  // Start collapsed on the pill rectangle, then expand to the full page.
  useLayoutEffect(() => {
    if (!open) {
      setExpanded(false);
      return;
    }
    void dialogRef.current?.getBoundingClientRect();
    const id = requestAnimationFrame(() => setExpanded(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOverlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeOverlay]);

  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
    else openerRef.current?.focus({ preventScroll: true });
  }, [open]);

  const busy = phase === "thinking";
  const listening = recorder.state === "recording";
  const micLabel = listening ? "Zaustavi snimanje" : "Pritisni i govori";
  const unavailable = recorder.state === "unavailable";

  const onDialogKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const nodes = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)") ?? [],
    );
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  const clip = expanded || !rect ? "inset(0px 0px 0px 0px round 0px)" : `inset(${rect.t}px ${rect.r}px ${rect.b}px ${rect.l}px round 999px)`;

  return (
    <main className={styles.page}>
      <h1 className={styles.slogan} inert={open}>Pričaj sa svojim gradom</h1>

      <div className={styles.mapFrame} inert={open}>
        <ZagrebMap target={target} selectedId={selectedId} />
        {placeName && (
          <p className={styles.place} role="status">
            {placeName}
          </p>
        )}
      </div>

      <div className={styles.actions} inert={open}>
        <div className={styles.pills}>
          <button ref={openerRef} type="button" className={styles.pill} data-primary="true" onClick={openOverlay}>
            Predstavi se
          </button>
          <button type="button" className={styles.pill} onClick={() => setShowSearchNote((v) => !v)} aria-describedby={showSearchNote ? "search-note" : undefined}>
            Pretraži
          </button>
        </div>
        {showSearchNote && (
          <p id="search-note" className={styles.note} role="status">
            Pretraga još nije dostupna.
          </p>
        )}
      </div>

      {open && (
        <div
          ref={dialogRef}
          className={styles.overlay}
          data-expanded={expanded}
          style={{ clipPath: clip }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="q"
          onKeyDown={onDialogKey}
        >
          <button type="button" className={styles.close} onClick={closeOverlay} aria-label="Zatvori">
            ×
          </button>
          <div className={styles.content}>
            <button
              type="button"
              className={styles.orb}
              data-state={busy ? "thinking" : listening ? "listening" : "idle"}
              aria-label={micLabel}
              aria-pressed={listening}
              disabled={busy || unavailable}
              onClick={() => (listening ? recorder.stop() : recorder.start())}
            />
            <h2 id="q" className={styles.question}>
              Koji kvart te zanima?
            </h2>
            <p className={styles.live} role="status" aria-live="polite">
              {busy ? "Trenutak…" : listening ? "Slušam…" : notice || (unavailable ? "Mikrofon nije dostupan. Upiši kvart." : "Pritisni kuglu i govori")}
            </p>
            <form
              className={styles.typeRow}
              onSubmit={(e) => {
                e.preventDefault();
                const t = typed.trim();
                if (!t || busy) return;
                cancelRecording();
                void decide(t);
              }}
            >
              <label className="sr-only" htmlFor="kvart">
                Upiši kvart
              </label>
              <input
                id="kvart"
                ref={inputRef}
                className={styles.input}
                value={typed}
                maxLength={200}
                autoComplete="off"
                placeholder="ili upiši ovdje"
                onChange={(e) => setTyped(e.target.value)}
                disabled={busy}
              />
              <button type="submit" className={styles.go} disabled={busy || !typed.trim()}>
                Idemo
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
