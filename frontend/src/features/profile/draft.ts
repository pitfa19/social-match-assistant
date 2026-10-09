/**
 * Local, fixed intro questions. This is a scripted demo, not a language model.
 * Answers are stored exactly as typed.
 */
export type IntroStep = { id: string; heading: string; question: string; hint: string };

export const INTRO_STEPS: IntroStep[] = [
  {
    id: "goal",
    heading: "Trenutni cilj",
    question: "Što trenutno tražiš ili nudiš?",
    hint: "Npr. tražim stan, nudim sate gitare",
  },
  {
    id: "where",
    heading: "Mjesto i vrijeme",
    question: "Gdje i kada ti odgovara?",
    hint: "Kvart, dani, rokovi",
  },
  {
    id: "limits",
    heading: "Važno i neprihvatljivo",
    question: "Što ti je važno, a što isključuješ?",
    hint: "Budžet, uvjeti",
  },
  {
    id: "extra",
    heading: "Dodatno",
    question: "Želiš li još nešto dodati?",
    hint: "Neobavezno",
  },
];

/** Builds an editable draft: fixed headings + the user's exact words. */
export function buildDraft(answers: Record<string, string>): string {
  return INTRO_STEPS.filter((s) => (answers[s.id] ?? "").trim())
    .map((s) => `${s.heading}: ${answers[s.id].trim()}`)
    .join("\n");
}
