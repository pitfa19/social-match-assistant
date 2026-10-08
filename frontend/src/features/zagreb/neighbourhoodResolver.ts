// Deterministic neighbourhood resolution and bounded Decisions choice planning. Pure, no I/O.
import { NEIGHBOURHOODS, type Neighbourhood } from "./neighbourhoods.ts";

/** Hard ceiling on choices sent to Decisions in one question. */
export const MAX_CHOICES = 256;
export const UNCLEAR = "unclear";
/** Preferred ceiling for one question. Smaller lists are more reliable than the hard cap, so larger catalogues go hierarchical. */
export const PREFERRED_CHOICES = 64;

export function normalise(s: string): string {
  const base = s.toLowerCase().replace(/đ/g, "dj").normalize("NFD").replace(/\p{M}/gu, "");
  return base.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Words a user may wrap around a bare place name without changing its meaning.
// Never strip kind qualifiers (mjesni odbor / MO / gradska četvrt / GČ): they pick district vs local committee.
const FILLER = new Set(["u", "na", "iz", "kvart", "kvartu", "kvarta", "zagreb", "zagrebu", "podrucje", "podrucju", "zelim", "trazim", "me", "zanima", "to", "je"]);

type AliasRow = { key: string; words: string[]; place: Neighbourhood };

const ROWS: AliasRow[] = NEIGHBOURHOODS.flatMap((place) =>
  place.aliases.map((a) => ({ key: normalise(a), words: normalise(a).split(" "), place })),
);

const BY_KEY = new Map<string, Neighbourhood[]>();
for (const r of ROWS) {
  const list = BY_KEY.get(r.key) ?? [];
  if (!list.includes(r.place)) list.push(r.place);
  BY_KEY.set(r.key, list);
}

export type Resolution =
  | { status: "selected"; place: Neighbourhood; via: "explicit" }
  | { status: "ambiguous"; candidates: Neighbourhood[] }
  | { status: "none" };

/**
 * A name shared by a district and its own same-named local committee (Trnje, Maksimir, ...)
 * resolves to the district. Any other shared name is reported as ambiguous.
 */
function disambiguate(list: Neighbourhood[]): Neighbourhood[] {
  if (list.length <= 1) return list;
  const districts = list.filter((p) => p.kind === "district");
  if (districts.length === 1 && list.every((p) => p === districts[0] || p.districtId === districts[0].id)) return districts;
  return list;
}

/** Resolve only when the whole answer is one alias, ignoring filler words. Never infers from streets or landmarks. */
export function resolveExplicit(text: string): Resolution {
  const words = normalise(text).split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 12) return { status: "none" };
  const stripped = words.filter((w) => !FILLER.has(w));
  // Full alias first so qualified forms win, then the filler-free form.
  const attempts = [words.join(" "), stripped.join(" ")];
  for (const key of attempts) {
    const list = BY_KEY.get(key);
    if (!list) continue;
    const found = disambiguate(list);
    if (found.length === 1) {
      // Generic names such as "Centar" are not usable alone, only in their qualified alias.
      if (found[0].generic && normalise(found[0].name) === key) return { status: "ambiguous", candidates: found };
      return { status: "selected", place: found[0], via: "explicit" };
    }
    return { status: "ambiguous", candidates: found };
  }
  return { status: "none" };
}

export type ChoiceStage = {
  name: string;
  /** Place ids offered in this stage, in stable order. */
  ids: string[];
  /** Choices as sent to Decisions, including the unclear option. Always <= MAX_CHOICES. */
  choices: Array<{ value: string; description: string }>;
};

const UNCLEAR_DESCRIPTION =
  "Korisnik nije izričito imenovao točno jedno od ovih područja: ime nije na popisu, navedeno je više područja, spominje se samo ulica, znamenitost ili susjedno područje, ili je nejasno.";

function describe(p: Neighbourhood): { value: string; description: string } {
  const al = p.aliases.filter((a) => a !== p.name).slice(0, 4);
  return { value: p.id, description: `Samo ako korisnik izričito navede: ${p.hint}${al.length ? ` (${al.join(", ")})` : ""}.` };
}

/** Stage 1 for a hierarchy: districts and colloquial groups only. */
export function topLevel(places: readonly Neighbourhood[]): Neighbourhood[] {
  return places.filter((p) => p.kind !== "local_committee");
}

/** Stage 2 for a hierarchy: a district itself plus its local committees. */
export function withinDistrict(places: readonly Neighbourhood[], districtId: string): Neighbourhood[] {
  return places.filter((p) => p.id === districtId || (p.kind === "local_committee" && p.districtId === districtId));
}

function stage(name: string, places: Neighbourhood[]): ChoiceStage {
  const choices = [...places.map(describe), { value: UNCLEAR, description: UNCLEAR_DESCRIPTION }];
  if (choices.length > MAX_CHOICES) throw new Error(`choice stage ${name} has ${choices.length} > ${MAX_CHOICES}`);
  return { name, ids: places.map((p) => p.id), choices };
}

/**
 * Plan the first Decisions question. One flat question when everything fits within the cap,
 * otherwise a district level question followed by a per-district question.
 */
export function planFirstStage(places: readonly Neighbourhood[] = NEIGHBOURHOODS, cap = PREFERRED_CHOICES): { hierarchical: boolean; stage: ChoiceStage } {
  if (places.length + 1 <= Math.min(cap, PREFERRED_CHOICES, MAX_CHOICES)) return { hierarchical: false, stage: stage("neighbourhood", [...places]) };
  return { hierarchical: true, stage: stage("district", topLevel(places)) };
}

export function planSecondStage(districtId: string, places: readonly Neighbourhood[] = NEIGHBOURHOODS): ChoiceStage | null {
  const list = withinDistrict(places, districtId);
  return list.length > 1 ? stage("neighbourhood", list) : null;
}

export type Ask = (stage: ChoiceStage) => Promise<{ choice: string; confidence: number } | null>;
export type Decision =
  | { status: "selected"; id: string; via: "explicit" | "decisions" }
  | { status: "clarify"; candidates?: string[] };

const MIN_CONFIDENCE = 0.5;
const confident = (c: unknown): boolean => typeof c === "number" && Number.isFinite(c) && c >= MIN_CONFIDENCE && c <= 1;

/** Explicit alias resolution first, then the (injected) Decisions call, flat or hierarchical. */
export async function decideNeighbourhood(text: string, ask: Ask, places: readonly Neighbourhood[] = NEIGHBOURHOODS, cap = PREFERRED_CHOICES): Promise<Decision> {
  const explicit = resolveExplicit(text);
  if (explicit.status === "selected") return { status: "selected", id: explicit.place.id, via: "explicit" };
  if (explicit.status === "ambiguous") return { status: "clarify", candidates: explicit.candidates.map((c) => c.id) };

  const first = planFirstStage(places, cap);
  const a = await ask(first.stage);
  if (!a || a.choice === UNCLEAR || !confident(a.confidence) || !first.stage.ids.includes(a.choice)) return { status: "clarify" };
  if (!first.hierarchical) return { status: "selected", id: a.choice, via: "decisions" };

  const second = planSecondStage(a.choice, places);
  if (!second) return { status: "selected", id: a.choice, via: "decisions" };
  const b = await ask(second);
  if (!b || b.choice === UNCLEAR || !confident(b.confidence) || !second.ids.includes(b.choice)) return { status: "clarify" };
  return { status: "selected", id: b.choice, via: "decisions" };
}
