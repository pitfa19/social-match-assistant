/**
 * Local, fixed intro questions. This is a scripted demo, not a language model.
 * Answers are stored exactly as typed.
 */
export type IntroStep = { id: string; heading: string; question: string; hint: string };

export const INTRO_STEPS: IntroStep[] = [
  {
    id: "goal",
    heading: "Trenutni cilj",
    question: "Što trenutno tražiš ili nudiš? Opiši svojim riječima.",
    hint: "Na primjer: tražim stan za dvoje, nudim sate gitare.",
  },
  {
    id: "where",
    heading: "Mjesto i vrijeme",
    question: "Gdje u Zagrebu i kada ti odgovara?",
    hint: "Kvart, dani u tjednu, rokovi. Preskoči ako nije važno.",
  },
  {
    id: "limits",
    heading: "Važno i neprihvatljivo",
    question: "Što ti je važno, a što nikako ne dolazi u obzir?",
    hint: "Budžet, uvjeti, dogovori. Ne moraš ništa osobno otkrivati.",
  },
  {
    id: "extra",
    heading: "Dodatno",
    question: "Želiš li dodati još nešto što pomaže pri traženju?",
    hint: "Neobavezno.",
  },
];

/** Builds an editable draft: fixed headings + the user's exact words. */
export function buildDraft(answers: Record<string, string>): string {
  return INTRO_STEPS.filter((s) => (answers[s.id] ?? "").trim())
    .map((s) => `${s.heading}: ${answers[s.id].trim()}`)
    .join("\n");
}
