// Pure, dependency-free logic for the Zagreb introduction flow. Used by client and server.

export const QUESTIONS = [
  "Kako bi se opisao?",
  "Što te zanima?",
  "Što trenutno tražiš ili možeš ponuditi?",
  "Koji kvart te zanima?",
] as const;
export const PROFILE_STEPS = 3; // steps 0..2 are profile questions, step 3 is the neighbourhood

export const TOPICS = [
  { id: "sport", label: "Sport i rekreacija", hint: "sport, trčanje, planinarenje, biciklizam, teretana, rekreacija" },
  { id: "glazba", label: "Glazba", hint: "glazba, sviranje, koncerti, bend, pjevanje" },
  { id: "umjetnost", label: "Umjetnost i kultura", hint: "umjetnost, kazalište, film, fotografija, dizajn, crtanje" },
  { id: "tehnologija", label: "Tehnologija", hint: "programiranje, računala, softver, startupi, elektronika" },
  { id: "hrana", label: "Hrana i piće", hint: "kuhanje, restorani, kava, vino, hrana" },
  { id: "putovanja", label: "Putovanja", hint: "putovanja, izleti, istraživanje gradova" },
  { id: "priroda", label: "Priroda i životinje", hint: "priroda, vrtlarenje, psi, mačke, šetnje parkom" },
  { id: "knjige", label: "Knjige i učenje", hint: "čitanje, knjige, jezici, tečajevi, učenje" },
  { id: "posao", label: "Posao i karijera", hint: "posao, zaposlenje, freelance, usluge, poslovne prilike" },
  { id: "druzenje", label: "Druženje i zajednica", hint: "upoznavanje ljudi, društvo, volontiranje, događaji, zajednica" },
  { id: "dom", label: "Dom i stanovanje", hint: "stan, najam, selidba, namještaj, popravci" },
  { id: "stvari", label: "Stvari i razmjena", hint: "stvari za prodati, pokloniti, posuditi ili kupiti" },
] as const;
export const NONE_TOPIC = "none";
export const TOPIC_IDS: readonly string[] = TOPICS.map((t) => t.id);
export function topicLabel(id: string): string | undefined {
  return TOPICS.find((t) => t.id === id)?.label;
}

export const MAX_CLAUSES = 6;
export const MAX_CLAUSE_LEN = 400;
export const MAX_ANSWER_LEN = 1200;

const NEGATION = /(^|[^\p{L}])(ne|nisam|nisi|nije|nismo|nemam|nemoj|neću|ne\s?mogu|nikad|nikada|nitko|ništa|nista|bez|nimalo|ni)(?=$|[^\p{L}])/iu;

/** Conservative negation check. Negated clauses may stay as facts but never become topic tags. */
export function isNegated(clause: string): boolean {
  return NEGATION.test(clause);
}

export function normalize(s: string): string {
  return s.normalize("NFC").toLocaleLowerCase("hr").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * Split an answer into verbatim sentence clauses (sentence punctuation only, so a negation is never
 * detached from what it negates). Clauses are never truncated or rewritten. Negated clauses are kept
 * as explicit facts, but never produce a topic tag.
 */
export function candidateClauses(answer: string): string[] {
  const parts = answer
    .normalize("NFC")
    .split(/[.!?;\n]+/u)
    .map((p) => p.replace(/^[\s,–-]+|[\s,–-]+$/g, "").replace(/\s+/g, " "))
    .filter((p) => p.length >= 3 && /\p{L}{2,}/u.test(p));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (p.length > MAX_CLAUSE_LEN) continue; // omit, never truncate
    const k = normalize(p);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    if (out.length >= MAX_CLAUSES) break;
  }
  return out;
}

export type NoteKind = "fact" | "topic";
export type FactRole = "description" | "interest" | "request" | "offer";
export type Note = { key: string; kind: NoteKind; text: string; role?: FactRole };
export type Extracted = { text: string; topic: string; role?: FactRole };

export function noteKey(kind: NoteKind, value: string): string {
  return kind === "fact" ? `f:${normalize(value)}` : `t:${value}`;
}

export type ProfileState = {
  step: number; // 0..3, 4 = done
  notes: Note[];
  removed: string[]; // keys the user deleted. Never re-added, even by later answers.
  covered?: number[]; // Future questions explicitly answered, independent of the current prompt.
  neighbourhoodId?: string; // Grounded early location, retained until remaining questions are answered.
};

export const initialState: ProfileState = { step: 0, notes: [], removed: [] };

/** Blank answers never advance and never add notes. */
export function isBlank(answer: string): boolean {
  return normalize(answer).length === 0;
}

/** Apply extracted items for `step`. Ignores stale steps, removed keys and duplicates; advances the step. */
export function applyAnswer(state: ProfileState, step: number, items: Extracted[], coverage?: number[], neighbourhoodId?: string): ProfileState {
  if (step !== state.step || step > PROFILE_STEPS) return state;
  const removed = new Set(state.removed);
  const have = new Set(state.notes.map((n) => n.key));
  const next = [...state.notes];
  const add = (kind: NoteKind, key: string, text: string, role?: FactRole) => {
    if (removed.has(key) || have.has(key)) return;
    have.add(key);
    next.push({ key, kind, text, ...(role ? { role } : {}) });
  };
  for (const it of items) {
    if (!it.text || (it.topic !== NONE_TOPIC && !TOPIC_IDS.includes(it.topic))) continue;
    add("fact", noteKey("fact", it.text), it.text, it.role);
    if (it.topic !== NONE_TOPIC) add("topic", noteKey("topic", it.topic), topicLabel(it.topic) as string);
  }
  const covered = new Set([...(state.covered ?? []), ...Array.from({ length: step }, (_, i) => i)]);
  // Legacy responses have no coverage field. Adaptive responses never infer progress from the prompt alone.
  if (coverage === undefined && step < PROFILE_STEPS) covered.add(step);
  for (const n of coverage ?? []) if (Number.isInteger(n) && n >= 0 && n < PROFILE_STEPS) covered.add(n);
  const area = neighbourhoodId || state.neighbourhoodId;
  const nextStep = [0, 1, 2].find((n) => !covered.has(n)) ?? (area ? 4 : 3);
  return { ...state, step: nextStep, notes: next, covered: [...covered].sort(), ...(area ? { neighbourhoodId: area } : {}) };
}

export function removeNote(state: ProfileState, key: string): ProfileState {
  return {
    ...state,
    notes: state.notes.filter((n) => n.key !== key),
    removed: state.removed.includes(key) ? state.removed : [...state.removed, key],
  };
}

/** Called after the neighbourhood is chosen. */
export function finish(state: ProfileState): ProfileState {
  return state.step === PROFILE_STEPS ? { ...state, step: PROFILE_STEPS + 1 } : state;
}

/**
 * Map decision answers back onto candidate clauses by index. The model never writes text:
 * each result is one of our own verbatim clauses. Per clause i the request asks
 * `s{i}` (predicate: the speaker states a fact about themselves, not about someone else, not negated)
 * and `c{i}` (choice: fixed topic or "none"). A clause is kept only if s{i} passes.
 * Topic "none" keeps the fact without a tag.
 */
export function mapDecisions(
  clauses: string[],
  answers: Array<{ name?: unknown; type?: unknown; choice?: unknown; confidence?: unknown; probability?: unknown }>,
  minConfidence = 0.5,
): Extracted[] {
  const self = new Map<number, boolean>();
  const topic = new Map<number, string>();
  for (const a of answers) {
    const m = typeof a.name === "string" ? /^([sc])(\d+)$/.exec(a.name) : null;
    if (!m) continue;
    const i = Number(m[2]);
    if (clauses[i] === undefined) continue;
    if (m[1] === "s" && a.type === "predicate" && typeof a.probability === "number") {
      self.set(i, a.probability >= 0.6);
    } else if (m[1] === "c" && a.type === "choice" && typeof a.choice === "string") {
      const conf = typeof a.confidence === "number" ? a.confidence : 0;
      topic.set(i, TOPIC_IDS.includes(a.choice) && conf >= minConfidence ? a.choice : NONE_TOPIC);
    }
  }
  const out: Extracted[] = [];
  clauses.forEach((clause, i) => {
    if (self.get(i) !== true) return;
    // A negated clause stays a fact but never yields a (positive) topic tag.
    out.push({ text: clause, topic: isNegated(clause) ? NONE_TOPIC : (topic.get(i) ?? NONE_TOPIC) });
  });
  return out;
}
