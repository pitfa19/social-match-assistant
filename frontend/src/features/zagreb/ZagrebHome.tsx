"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ZagrebMap, type MapHighlight, type MapTarget } from "./ZagrebMap";
import { findNeighbourhood } from "./neighbourhoods";
import { useRealtimeVoice } from "./useRealtimeVoice";
import {
  applyAnswer, finish, initialState, isBlank, PROFILE_STEPS, QUESTIONS, removeNote,
  type Extracted, type ProfileState,
} from "./profileLogic";
import styles from "./Zagreb.module.css";

type Phase = "ready" | "thinking" | "clarify" | "error";

export function ZagrebHome() {
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
  const submittingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLUListElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const setProfileBoth = useCallback((next: ProfileState) => {
    profileRef.current = next;
    setProfile(next);
  }, []);
  const step = profile.step;
  const done = step > PROFILE_STEPS;
  const mapShown = done && !!target;

  // One shared transaction gate covers typed and voice answers, including same-tick races.
  const submit = useCallback(async (raw: string) => {
    if (submittingRef.current || profileRef.current.step > PROFILE_STEPS) return;
    const text = raw.trim();
    if (isBlank(text)) { setNotice("Upiši ili reci odgovor."); return; }
    const forStep = profileRef.current.step;
    if (text.length > (forStep < PROFILE_STEPS ? 400 : 200)) {
      setTyped(text.slice(0, forStep < PROFILE_STEPS ? 400 : 200));
      setNotice("Odgovor je predug. Skrati ga i pošalji ponovno.");
      return;
    }
    submittingRef.current = true;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase("thinking");
    setNotice("");
    setTyped(text);
    try {
      const isProfile = forStep < PROFILE_STEPS;
      const res = await fetch(isProfile ? "/api/zagreb/profile" : "/api/zagreb/neighbourhood", {
        signal: ac.signal,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(isProfile ? { step: forStep, text } : { text }),
      });
      const data = (await res.json()) as { status?: string; items?: Extracted[]; id?: string; error?: string };
      if (ac.signal.aborted || profileRef.current.step !== forStep) return;
      if (!res.ok) {
        setNotice(data.error || "Pokušaj ponovno ili upiši odgovor.");
        setPhase("error");
        return;
      }
      if (isProfile) {
        if (!["ok", "empty"].includes(data.status ?? "") || !Array.isArray(data.items)) {
          throw new Error("Invalid profile response");
        }
        setProfileBoth(applyAnswer(profileRef.current, forStep, data.items));
      } else {
        const hit = data.status === "selected" && data.id ? findNeighbourhood(data.id) : undefined;
        if (!hit) {
          setNotice("Nisam siguran koji kvart misliš. Navedi ga imenom.");
          setPhase("clarify");
          return;
        }
        setPlaceName(hit.name);
        setSelectedId(hit.id);
        setTarget({ lat: hit.lat, lng: hit.lng, zoom: hit.zoom });
        // This is an approximate area, not an administrative boundary.
        setHighlight({ lat: hit.lat, lng: hit.lng, label: hit.name, radiusM: 700 });
        setProfileBoth(finish(profileRef.current));
      }
      setTyped("");
      setPhase("ready");
    } catch {
      if (!ac.signal.aborted) {
        setNotice("Nema veze. Pokušaj ponovno ili upiši odgovor.");
        setPhase("error");
      }
    } finally {
      submittingRef.current = false;
    }
  }, [setProfileBoth]);

  // Returning submit's promise holds realtime routing until this answer is processed.
  const voice = useRealtimeVoice({ onFinal: submit });
  const { stop: stopVoice } = voice;
  useEffect(() => { if (done) stopVoice(); }, [done, stopVoice]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (done) headingRef.current?.focus({ preventScroll: true });
  }, [done]);

  const remove = (key: string) => {
    setProfileBoth(removeNote(profileRef.current, key));
    requestAnimationFrame(() => notesRef.current?.focus({ preventScroll: true }));
  };
  const busy = phase === "thinking";
  const listening = voice.state === "listening";
  const micLabel = voice.active ? "Pauziraj mikrofon" : "Pokreni mikrofon";
  const status = busy ? "Bilježim…" : notice || voice.error?.message || (
    voice.state === "starting" ? "Spajam mikrofon…" :
    voice.state === "paused" ? "Pripremam sljedeće pitanje…" :
    listening ? "Slušam. Kratka tišina šalje odgovor." : "Pokreni mikrofon jednom ili upiši odgovor."
  );

  const questionBlock = (
    <div data-testid="onboarding-step" data-step={done ? "done" : String(step)} aria-live="polite">
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

  return (
    <main className={styles.page}>
      <h1 className={styles.slogan}>Pričaj sa svojim gradom</h1>
      <section className={styles.overlay} data-expanded="true" aria-label="Upoznajmo se">
        <div className={styles.split} data-cols="2">
          <section className={styles.notesCol} aria-label="Bilješke o tebi">
            {mapShown && questionBlock}
            <h2 className={styles.stepNo}>O tebi</h2>
            <ul ref={notesRef} tabIndex={-1} className={styles.notes} data-testid="profile-notes" aria-label="Tvoje bilješke">
              {profile.notes.map((n) => (
                <li key={n.key}>
                  <button type="button" className={styles.noteBtn} data-kind={n.kind}
                    data-testid={n.kind === "fact" ? "profile-fact" : "profile-topic"}
                    aria-label={`Ukloni: ${n.text}`} onClick={() => remove(n.key)}>
                    <span>{n.text}</span><span className={styles.noteX} aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className={styles.notesHint}>{profile.notes.length ? "Klikni bilješku da je ukloniš." : "Tvoji interesi i ideje pojavit će se ovdje."}</p>
          </section>
          {mapShown ? (
            <div className={styles.mapCol}>
              <div className={styles.mapFrame}>
                <ZagrebMap target={target} selectedId={selectedId} highlight={highlight} />
                <p className={styles.place} role="status">{placeName}</p>
              </div>
            </div>
          ) : (
            <div className={styles.content}>
              <button type="button" className={styles.orb}
                data-state={busy ? "thinking" : listening ? "listening" : "idle"}
                data-voice-state={voice.state} aria-label={micLabel} aria-pressed={voice.active}
                disabled={busy && !voice.active}
                onClick={() => { setNotice(""); if (voice.active) voice.stop(); else void voice.start(); }} />
              {questionBlock}
              <p className={styles.live} role="status" aria-live="polite">{status}</p>
              {voice.partial && <p className={styles.live} data-testid="live-transcript" aria-label="Prijepis uživo">{voice.partial}</p>}
              <form className={styles.typeRow} onSubmit={(e) => {
                e.preventDefault();
                if (busy) return;
                voice.stop();
                void submit(typed);
              }}>
                <input id="odgovor" ref={inputRef} aria-label="Tvoj odgovor" className={styles.input}
                  value={typed} maxLength={step < PROFILE_STEPS ? 400 : 200} autoComplete="off"
                  placeholder="ili upiši ovdje" onChange={(e) => setTyped(e.target.value)} disabled={busy} />
                <button type="submit" className={styles.go} disabled={busy || !typed.trim()}>
                  {step < PROFILE_STEPS ? "Dalje" : "Idemo"}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
