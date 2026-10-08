"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "./Dialog";
import { SendIcon } from "../../components/Icons";
import VoiceRecorder from "../../components/VoiceRecorder";
import { INTRO_STEPS, buildDraft } from "./draft";

type Props = {
  onClose: () => void;
  /** Called with the confirmed text. Returns an error message or null. */
  onSave: (text: string) => string | null;
};

type Phase = "chat" | "review";

export function IntroChat({ onClose, onSave }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("chat");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [step, phase]);

  const current = INTRO_STEPS[step];

  function advance(text: string) {
    const next = { ...answers, [current.id]: text };
    setAnswers(next);
    setInput("");
    if (step + 1 < INTRO_STEPS.length) {
      setStep(step + 1);
    } else {
      setDraft(buildDraft(next));
      setPhase("review");
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    advance(input.trim());
  }

  function confirm() {
    if (!draft.trim()) {
      setError("Profil je prazan. Dodaj barem jednu rečenicu ili se vrati na razgovor.");
      return;
    }
    const err = onSave(draft.trim());
    if (err) setError(err);
  }

  return (
    <Dialog title="Predstavi se" titleId="intro-title" onClose={onClose}>
      {phase === "chat" ? (
        <div className="chat">
          <p className="demo-note">Demo razgovor · bez AI-ja</p>
          {step > 0 && (
            <details className="prev">
              <summary>Razgovor</summary>
              <div className="chat-log" ref={logRef}>
                {INTRO_STEPS.slice(0, step).map((s) => (
                  <div key={s.id} className="chat-turn">
                    <p className="bubble bubble-q">{s.question}</p>
                    <p className="bubble bubble-a">{answers[s.id] ? answers[s.id] : <em>Preskočeno</em>}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
          <p className="bubble bubble-q current-q" aria-live="polite">
            {current.question}
          </p>
          <form className="chat-form" onSubmit={submit}>
            <label htmlFor="intro-input" className="sr-only">
              {current.question}
            </label>
            <textarea
              id="intro-input"
              data-testid="intro-input"
              data-autofocus
              className="field"
              rows={3}
              value={input}
              placeholder={current.hint}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && input.trim()) {
                  e.preventDefault();
                  advance(input.trim());
                }
              }}
            />
            <div className="chat-actions">
              <VoiceRecorder />
              <span className="step-count">
                {step + 1}/{INTRO_STEPS.length}
              </span>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => advance("")}>
                Preskoči
              </button>
              <button type="submit" data-testid="intro-next" className="btn btn-primary" disabled={!input.trim()}>
                Dalje <SendIcon />
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="review">
          <label htmlFor="draft" className="label">
            Nacrt profila
          </label>
          <textarea
            id="draft"
            data-testid="draft-text"
            data-autofocus
            className="field field-draft"
            rows={6}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
          />
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <p className="demo-note">Tvoje riječi, uredi ih. Sprema se tek nakon potvrde.</p>
          <div className="chat-actions">
            <button type="button" className="btn btn-quiet" onClick={() => setPhase("chat")}>
              Natrag na razgovor
            </button>
            <button type="button" className="btn btn-primary" onClick={confirm} data-testid="draft-confirm">
              Potvrdi i spremi
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
