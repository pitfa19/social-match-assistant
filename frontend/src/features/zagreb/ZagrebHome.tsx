"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ZagrebMap, type MapHighlight, type MapTarget } from "./ZagrebMap";
import { findNeighbourhood } from "./neighbourhoods";
import { useRecorder } from "./useRecorder";
import {
  applyAnswer, finish, initialState, isBlank, PROFILE_STEPS, QUESTIONS, removeNote,
  type Extracted, type ProfileState,
} from "./profileLogic";
import styles from "./Zagreb.module.css";

type Phase = "ready" | "thinking" | "clarify" | "error";

export function ZagrebHome() {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [rect, setRect] = useState<{ t: number; r: number; b: number; l: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useState<ProfileState>(initialState);
  const profileRef = useRef<ProfileState>(initialState);
  const [target, setTarget] = useState<MapTarget | null>(null);
  const [highlight, setHighlight] = useState<MapHighlight | null>(null);
  const [placeName, setPlaceName] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [showSearchNote, setShowSearchNote] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLUListElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<() => void>(() => {});

  const setProfileBoth = useCallback((next: ProfileState) => {
    profileRef.current = next;
    setProfile(next);
  }, []);

  const step = profile.step;
  const done = step > PROFILE_STEPS;
  const mapShown = done && !!target;

  const newRequest = () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    return ac;
  };

  const refocus = () => requestAnimationFrame(() => (inputRef.current ?? notesRef.current)?.focus({ preventScroll: true }));

  /** Steps 0..2: extract grounded facts and topics from the answer. */
  const extract = useCallback(
    async (text: string) => {
      const forStep = profileRef.current.step;
      const ac = newRequest();
      setPhase("thinking");
      setNotice("");
      try {
        const res = await fetch("/api/zagreb/profile", {
          signal: ac.signal,
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ step: forStep, text }),
        });
        const data = (await res.json()) as { status?: string; items?: Extracted[]; error?: string };
        if (ac.signal.aborted || profileRef.current.step !== forStep) return;
        if (!res.ok) {
          setNotice(data.error || "Pokušaj ponovno.");
          setPhase("error");
          return;
        }
        // Advance only on a successful extraction. Removed notes are filtered inside applyAnswer.
        setProfileBoth(applyAnswer(profileRef.current, forStep, Array.isArray(data.items) ? data.items : []));
        setTyped("");
        setPhase("ready");
        refocus();
      } catch {
        if (ac.signal.aborted) return;
        setNotice("Nema veze. Pokušaj ponovno.");
        setPhase("error");
      }
    },
    [setProfileBoth],
  );

  /** Step 3: existing Decisions neighbourhood route. */
  const decide = useCallback(
    async (text: string) => {
      const ac = newRequest();
      setPhase("thinking");
      setNotice("");
      try {
        const res = await fetch("/api/zagreb/neighbourhood", {
          signal: ac.signal,
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = (await res.json()) as { status?: string; id?: string; error?: string };
        if (ac.signal.aborted) return;
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
        // Approximate circle around the curated anchor. Not an administrative boundary.
        setHighlight({ lat: hit.lat, lng: hit.lng, label: hit.name, radiusM: 700 });
        setProfileBoth(finish(profileRef.current));
        window.setTimeout(() => headingRef.current?.focus({ preventScroll: true }), 50);
        setTyped("");
        setPhase("ready");
      } catch {
        if (ac.signal.aborted) return;
        setNotice("Nema veze. Pokušaj ponovno ili upiši kvart.");
        setPhase("error");
      }
    },
    [setProfileBoth],
  );

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (isBlank(text)) {
        setNotice("Upiši ili reci odgovor.");
        return;
      }
      if (profileRef.current.step < PROFILE_STEPS) void extract(text);
      else if (profileRef.current.step === PROFILE_STEPS) void decide(text);
    },
    [extract, decide],
  );

  const transcribe = useCallback(
    async (blob: Blob) => {
      const forStep = profileRef.current.step;
      const ac = newRequest();
      setPhase("thinking");
      setNotice("");
      try {
        const fd = new FormData();
        fd.set("audio", blob, "snimka");
        const res = await fetch("/api/zagreb/transcribe", { method: "POST", body: fd, signal: ac.signal });
        const data = (await res.json()) as { text?: string; error?: string };
        if (ac.signal.aborted || profileRef.current.step !== forStep) return;
        if (!res.ok || !data.text) {
          setNotice(data.error || "Nisam te razumio. Pokušaj ponovno ili upiši odgovor.");
          setPhase("error");
          return;
        }
        setTyped(data.text);
        submit(data.text);
      } catch {
        if (ac.signal.aborted) return;
        setNotice("Nema veze. Pokušaj ponovno ili upiši odgovor.");
        setPhase("error");
      }
    },
    [submit],
  );

  const recorder = useRecorder(transcribe);
  const { cancel: cancelRecording } = recorder;

  const closeOverlay = useCallback(() => {
    abortRef.current?.abort();
    cancelRecording();
    setPhase((p) => (p === "thinking" ? "ready" : p));
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
    abortRef.current?.abort();
    setProfileBoth(initialState);
    setTarget(null);
    setHighlight(null);
    setPlaceName("");
    setSelectedId("");
    setPhase("ready");
    setNotice("");
    setTyped("");
    setOpen(true);
  }, [setProfileBoth]);

  // Reopened overlay starts on the pill rectangle, then expands. First load starts expanded.
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
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

  const didMount = useRef(false);
  useEffect(() => {
    if (open) {
      // Keep focus in the dialog, but avoid raising the on-screen keyboard on touch devices.
      const touch = window.matchMedia("(pointer: coarse)").matches;
      (touch ? dialogRef.current?.querySelector<HTMLElement>("button") : inputRef.current)?.focus({ preventScroll: true });
    } else if (didMount.current) openerRef.current?.focus({ preventScroll: true });
    didMount.current = true;
  }, [open]);

  const remove = (key: string) => {
    setProfileBoth(removeNote(profileRef.current, key));
    refocus();
  };

  const busy = phase === "thinking";
  const listening = recorder.state === "recording";
  const micLabel = listening ? "Zaustavi snimanje" : "Pritisni i govori";
  const unavailable = recorder.state === "unavailable";
  const stepAttr = done ? "done" : String(step);

  const onDialogKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const nodes = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), a[href]") ?? [],
    );
    if (nodes.length === 0) return;
    const firstN = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === firstN || !dialogRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
      e.preventDefault();
      firstN.focus();
    }
  };

  const clip = expanded || !rect ? "inset(0px 0px 0px 0px round 0px)" : `inset(${rect.t}px ${rect.r}px ${rect.b}px ${rect.l}px round 999px)`;

  const questionBlock = (
    <div data-testid="onboarding-step" data-step={stepAttr}>
      {done ? (
        <h2 id="q" ref={headingRef} tabIndex={-1} className={styles.title}>Tvoj kvart: {placeName}</h2>
      ) : (
        <>
          <p className={styles.stepNo}>{step + 1} / {PROFILE_STEPS + 1}</p>
          <h2 id="q" className={styles.question}>{QUESTIONS[step]}</h2>
        </>
      )}
    </div>
  );

  const showNotes = profile.notes.length > 0 || step > 0 || done;

  return (
    <main className={styles.page}>
      <h1 className={styles.slogan} inert={open}>Pričaj sa svojim gradom</h1>

      <div className={styles.mapFrame} inert={open}>
        {!open && <ZagrebMap target={target} selectedId={selectedId} highlight={highlight} />}
        {!open && placeName && (
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
          <div className={styles.split} data-cols={showNotes || mapShown ? "2" : "1"}>
            {(showNotes || mapShown) && (
              <section className={styles.notesCol} aria-label="Bilješke o tebi">
                {mapShown && questionBlock}
                <ul ref={notesRef} tabIndex={-1} className={styles.notes} data-testid="profile-notes">
                  {profile.notes.map((n) => (
                    <li key={n.key}>
                      <button
                        type="button"
                        className={styles.noteBtn}
                        data-kind={n.kind}
                        data-testid={n.kind === "fact" ? "profile-fact" : "profile-topic"}
                        aria-label={`Ukloni: ${n.text}`}
                        onClick={() => remove(n.key)}
                      >
                        <span>{n.text}</span>
                        <span className={styles.noteX} aria-hidden="true">×</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {profile.notes.length > 0 && <p className={styles.notesHint}>Klikni bilješku da je ukloniš.</p>}
              </section>
            )}

            {mapShown ? (
              <div className={styles.mapCol}>
                <div className={styles.mapFrame}>
                  <ZagrebMap target={target} selectedId={selectedId} highlight={highlight} />
                  <p className={styles.place} role="status">{placeName}</p>
                </div>
              </div>
            ) : (
              <div className={styles.content}>
                <button
                  type="button"
                  className={styles.orb}
                  data-state={busy ? "thinking" : listening ? "listening" : "idle"}
                  aria-label={micLabel}
                  aria-pressed={listening}
                  disabled={busy || unavailable}
                  onClick={() => { setNotice(""); if (listening) recorder.stop(); else void recorder.start(); }}
                />
                {questionBlock}
                <p className={styles.live} role="status" aria-live="polite">
                  {busy ? "Trenutak…" : listening ? "Slušam…" : notice || (unavailable ? "Mikrofon nije dostupan. Upiši odgovor." : "Pritisni kuglu i govori ili upiši")}
                </p>
                <form
                  className={styles.typeRow}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (busy) return;
                    cancelRecording();
                    submit(typed);
                  }}
                >
                  <input
                    id="odgovor"
                    ref={inputRef}
                    aria-label="Tvoj odgovor"
                    className={styles.input}
                    value={typed}
                    maxLength={step < PROFILE_STEPS ? 400 : 200}
                    autoComplete="off"
                    placeholder="ili upiši ovdje"
                    onChange={(e) => setTyped(e.target.value)}
                    disabled={busy}
                  />
                  <button type="submit" className={styles.go} disabled={busy || !typed.trim()}>
                    {step < PROFILE_STEPS ? "Dalje" : "Idemo"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
