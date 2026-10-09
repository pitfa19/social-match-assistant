"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "./Dialog";
import { SendIcon } from "../../components/Icons";
import VoiceRecorder from "../../components/VoiceRecorder";
import { INTRO_STEPS, buildDraft } from "./draft";
import s from "./IntroChat.module.css";

type Props = {
  onClose: () => void;
  /** Called with the confirmed text. Returns an error message or null. */
  onSave: (text: string) => string | null;
};

type Phase = "chat" | "review";

const IMMERSIVE = { backdrop: s.backdrop, sheet: s.sheet, title: s.sr, close: s.close, body: s.body, testId: "intro-screen" };

export function IntroChat({ onClose, onSave }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("chat");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  function back() {
    if (step === 0) return;
    setStep(step - 1);
    setInput(answers[INTRO_STEPS[step - 1].id] ?? "");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (input.trim()) advance(input.trim());
  }

  function confirm() {
    if (!draft.trim()) {
      setError("Profil je prazan. Dodaj rečenicu ili se vrati.");
      return;
    }
    const err = onSave(draft.trim());
    if (err) setError(err);
  }

  return (
    <Dialog title="Predstavi se" titleId="intro-title" onClose={onClose} immersive={IMMERSIVE}>
      {phase === "chat" ? (
        <form className={s.form} onSubmit={submit}>
          <p className={s.step}>
            {step + 1}/{INTRO_STEPS.length}
          </p>
          <h3 className={s.q} data-testid="intro-question" aria-live="polite">
            {current.question}
          </h3>
          <label htmlFor="intro-input" className={s.sr}>
            {current.question}
          </label>
          <textarea
            id="intro-input"
            data-testid="intro-input"
            data-autofocus
            className={s.input}
            rows={2}
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
          <div className={s.row}>
            <div className={s.voice}>
              <VoiceRecorder />
            </div>
            <span className={s.spacer} />
            {step > 0 && (
              <button type="button" className={`${s.btn} ${s.quiet}`} onClick={back}>
                Natrag
              </button>
            )}
            <button type="button" className={`${s.btn} ${s.quiet}`} onClick={() => advance("")}>
              Preskoči
            </button>
            <button type="submit" data-testid="intro-next" className={`${s.btn} ${s.next}`} disabled={!input.trim()}>
              Dalje <SendIcon />
            </button>
          </div>
          <p className={s.tiny}>Demo · bez AI-ja</p>
        </form>
      ) : (
        <div className={s.form}>
          <h3 className={s.q} data-testid="intro-question">Je li ovo točno?</h3>
          <label htmlFor="draft" className={s.sr}>
            Nacrt profila
          </label>
          <textarea
            id="draft"
            data-testid="draft-text"
            data-autofocus
            className={s.draft}
            rows={6}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
          />
          {error && (
            <p role="alert" className={s.err}>
              {error}
            </p>
          )}
          <div className={s.row}>
            <span className={s.spacer} />
            <button type="button" className={`${s.btn} ${s.quiet}`} onClick={() => setPhase("chat")}>
              Natrag
            </button>
            <button type="button" className={`${s.btn} ${s.next}`} onClick={confirm} data-testid="draft-confirm">
              Potvrdi i spremi
            </button>
          </div>
          <p className={s.tiny}>Sprema se tek nakon potvrde.</p>
        </div>
      )}
    </Dialog>
  );
}
