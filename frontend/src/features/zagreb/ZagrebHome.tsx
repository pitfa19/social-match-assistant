"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ZagrebMap, type MapTarget } from "./ZagrebMap";
import { findNeighbourhood } from "./neighbourhoods";
import { useRealtimeVoice } from "./useRealtimeVoice";
import { useLayoutMotion } from "./useLayoutMotion";
import { IndexedResults } from "./IndexedResults";
import {
  applyAnswer, finish, initialState, isBlank, MAX_ANSWER_LEN, PROFILE_STEPS, QUESTIONS, removeNote,
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
  const [placeName, setPlaceName] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLUListElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const removingRef = useRef(new Set<string>());
  const hasNotes = profile.notes.length > 0;
  useLayoutMotion(pageRef, `${profile.step}:${profile.notes.map((note) => note.key).join(",")}`);

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
    if (text.length > (forStep < PROFILE_STEPS ? MAX_ANSWER_LEN : 200)) {
      setTyped(text.slice(0, forStep < PROFILE_STEPS ? MAX_ANSWER_LEN : 200));
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
      const data = (await res.json()) as { status?: string; items?: Extracted[]; coverage?: number[]; neighbourhoodId?: string; id?: string; error?: string };
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
        const area = data.neighbourhoodId ? findNeighbourhood(data.neighbourhoodId) : undefined;
        const next = applyAnswer(profileRef.current, forStep, data.items, data.coverage, area?.id);
        if (next.step === forStep) setNotice("Još mi reci odgovor na ovo pitanje. Ostale detalje sam zabilježio.");
        if (next.step > PROFILE_STEPS && next.neighbourhoodId) {
          const hit = findNeighbourhood(next.neighbourhoodId);
          if (hit) {
            setPlaceName(hit.name); setSelectedId(hit.id);
            setTarget({ lat: hit.lat, lng: hit.lng, zoom: hit.zoom });
          }
        }
        setProfileBoth(next);
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

  const remove = async (key: string, button: HTMLButtonElement) => {
    if (removingRef.current.has(key)) return;
    removingRef.current.add(key);
    const item = button.closest("li");
    if (item && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      await item.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(6px)" }],
        { duration: 150, easing: "ease-out", fill: "forwards" }).finished.catch(() => {});
    }
    setProfileBoth(removeNote(profileRef.current, key));
    removingRef.current.delete(key);
    requestAnimationFrame(() => (notesRef.current ?? inputRef.current ?? headingRef.current)?.focus({ preventScroll: true }));
  };
  const busy = phase === "thinking";
  const listening = voice.state === "listening";
  const micLabel = voice.active ? "Pauziraj mikrofon" : "Pokreni mikrofon";
  const status = busy ? (step < PROFILE_STEPS ? "Bilježim…" : "Pronalazim tvoj kvart…") : notice || voice.error?.message || (
    voice.state === "starting" ? "Spajam mikrofon…" :
    voice.state === "paused" ? "Pripremam sljedeće pitanje…" :
    listening ? "Slušam. Kratka tišina šalje odgovor." : "Pokreni mikrofon jednom ili upiši odgovor."
  );

  const questionBlock = (
    <div key={step} className={styles.questionBlock} data-testid="onboarding-step" data-step={done ? "done" : String(step)} aria-live="polite">
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
    <main ref={pageRef} className={styles.page} data-stage={mapShown ? "map" : hasNotes ? "conversation" : "welcome"}>
      <header className={styles.header}>
        <div className={styles.brand}><span className={styles.brandMark} aria-hidden="true">k²</span><span>kvart na kvadrat<span className={styles.brandDetail}>Zagreb</span></span></div>
        <h1 className={styles.slogan}>vaš omiljeni susjed</h1>
      </header>
      <section className={styles.overlay} data-expanded="true" aria-label="Upoznajmo se">
        <div className={styles.split} data-cols={hasNotes ? "2" : "1"} data-map={mapShown}>
          {hasNotes && <section className={styles.notesCol} aria-label="Bilješke o tebi" data-layout-key="notes">
            <div className={styles.notesHeading}><span className={styles.eyebrow}>SASTAVLJAMO TVOJU PRIČU</span><h2>O tebi<span className={styles.noteCount}>{profile.notes.length}</span></h2></div>
            <ul ref={notesRef} tabIndex={-1} className={styles.notes} data-testid="profile-notes" aria-label="Tvoje bilješke">
              {profile.notes.map((n) => (
                <li key={n.key} data-layout-key={`note-${n.key}`} className={styles.noteItem}>
                  <button type="button" className={styles.noteBtn} data-kind={n.kind}
                    data-testid={n.kind === "fact" ? "profile-fact" : "profile-topic"}
                    aria-label={`Ukloni: ${n.text}`} onClick={(event) => { void remove(n.key, event.currentTarget); }}>
                    <span>{n.text}</span><span className={styles.noteX} aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className={styles.notesHint}>Samo ono što si podijelio. Klikni bilješku da je ukloniš.</p>
          </section>}
          {mapShown ? (<>
            <div className={styles.mapCol} data-layout-key="map">
              {questionBlock}
              <p className={styles.mapIntro}>Tvoj dio grada. Odaberi područje i pogledaj susjedstvo.</p>
              <div className={styles.mapFrame}>
                <ZagrebMap target={target} selectedId={selectedId} onSelect={(id) => {
                  const hit = findNeighbourhood(id);
                  if (hit) { setSelectedId(hit.id); setPlaceName(hit.name); setTarget({ lat: hit.lat, lng: hit.lng, zoom: hit.zoom }); }
                }} />
              </div>
            </div>
            <IndexedResults areaId={selectedId} notes={profile.notes} />
          </>) : (
            <div className={styles.content} data-layout-key="conversation">
              <div className={styles.orbArea}>
              <button type="button" className={styles.orb}
                data-state={busy ? "thinking" : listening ? "listening" : "idle"}
                data-voice-state={voice.state} aria-label={micLabel} aria-pressed={voice.active}
                disabled={busy && !voice.active}
                onClick={() => { setNotice(""); if (voice.active) voice.stop(); else void voice.start(); }}>
                <span className={styles.orbCore} aria-hidden="true"><span /><span /><span /><span /><span /></span>
              </button>
              <span className={styles.micCaption}>{voice.active ? "Dodirni za pauzu" : "Dodirni i pričaj"}</span>
              </div>
              {questionBlock}
              <div className={styles.statusArea}>
                <p className={styles.live} data-error={phase === "error" || !!voice.error} role="status" aria-live="polite">
                  {(busy || voice.state === "starting" || voice.state === "paused") && <span className={styles.spinner} aria-hidden="true" />}
                  {listening && !busy && <span className={styles.listeningDot} aria-hidden="true" />}{status}
                </p>
                {voice.partial && <p className={styles.transcript} data-testid="live-transcript" aria-label="Prijepis uživo">{voice.partial}</p>}
              </div>
              <form className={styles.typeRow} onSubmit={(e) => {
                e.preventDefault();
                if (busy) return;
                voice.stop();
                void submit(typed);
              }}>
                <input id="odgovor" ref={inputRef} aria-label="Tvoj odgovor" className={styles.input}
                  value={typed} maxLength={step < PROFILE_STEPS ? MAX_ANSWER_LEN : 200} autoComplete="off"
                  placeholder="ili upiši ovdje" onChange={(e) => setTyped(e.target.value)} disabled={busy} />
                <button type="submit" className={styles.go} disabled={busy || !typed.trim()}>
                  {step < PROFILE_STEPS ? "Dalje" : "Idemo"}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>
      <footer className={styles.footer}><span>Manje traženja. Više povezivanja.</span><span>{mapShown ? "Tvoj Zagreb" : "Glasom ili tipkanjem. Tvojim tempom."}</span></footer>
    </main>
  );
}
