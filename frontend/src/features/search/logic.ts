import { LISTINGS } from "../../fixtures/listings.ts";
import type {
  BudgetState,
  Listing,
  SearchInput,
  SearchOutcome,
  SearchResult,
} from "./types.ts";

export const CATEGORY_LABELS: Record<string, string> = {
  all: "Sve",
  rental: "Najam",
  help: "Pomoć",
  tools: "Alati",
  gigs: "Poslovi",
};

const STOPWORDS = new Set([
  "i", "u", "na", "za", "je", "se", "su", "da", "li", "od", "do", "s", "sa", "o",
  "a", "ili", "te", "to", "mi", "me", "ja", "treba", "trebam", "tražim", "trazim",
  "imam", "bi", "ako", "po", "uz", "kao", "koji", "koja", "što", "sto", "ne",
]);

/** Lowercase and strip diacritics (đ -> d included). */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function tokenize(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of fold(text).split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    seen.add(raw);
  }
  return [...seen];
}

/** Two words match when equal, or when both are 5+ chars and share a 5-char prefix (simple Croatian inflection). */
export function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5) return a.slice(0, 5) === b.slice(0, 5);
  return false;
}

/** Parse budget text. Empty and invalid are distinct and never guessed. */
export function parseBudget(raw: string): BudgetState {
  const t = raw.trim();
  if (t === "") return { state: "empty" };
  const cleaned = t.replace(/\s*(€|eur|eura|euro)\s*$/i, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return { state: "invalid" };
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return { state: "invalid" };
  return { state: "ok", value };
}

/** Total monthly cost. Rentals: rent + utilities, unknown if either is missing. Others: price. */
export function totalCost(l: Listing): number | null {
  if (l.price === null) return null;
  if (l.category === "rental") {
    if (l.utilities === null) return null;
    return l.price + l.utilities;
  }
  return l.price;
}

function matchWords(queryTokens: string[], l: Listing): string[] {
  const docTokens = tokenize(`${l.title} ${l.body} ${l.area ?? ""}`);
  return queryTokens.filter((q) => docTokens.some((d) => wordsMatch(q, d)));
}

export function search(
  input: SearchInput,
  listings: readonly Listing[] = LISTINGS,
): SearchOutcome {
  const budget = parseBudget(input.budget);
  const notes: string[] = [];
  if (budget.state === "invalid") {
    notes.push("Proračun nije valjan broj pa se ne primjenjuje. Upišite npr. 500.");
  }
  const profileActive = input.useProfile && input.profile.trim() !== "";
  const intentTokens = tokenize(input.intent);
  const profileTokens = profileActive
    ? tokenize(input.profile).filter((t) => !intentTokens.includes(t))
    : [];
  const queryWordCount = intentTokens.length + profileTokens.length;

  let hiddenUnknownPrice = 0;
  let noWordMatch = 0;
  const results: SearchResult[] = [];

  for (const listing of listings) {
    // 1. Hard filters first.
    if (input.category !== "all" && listing.category !== input.category) continue;
    if (input.area !== "all" && listing.area !== input.area) continue;
    const total = totalCost(listing);
    if (budget.state === "ok") {
      if (total === null) {
        hiddenUnknownPrice++;
        continue;
      }
      if (total > budget.value) continue;
    }
    // 2. Lexical relevance.
    const fromIntent = matchWords(intentTokens, listing);
    const fromProfile = matchWords(profileTokens, listing);
    if (queryWordCount > 0 && fromIntent.length + fromProfile.length === 0) {
      noWordMatch++;
      continue;
    }
    const reasons: string[] = [];
    if (input.category !== "all") reasons.push(`Kategorija: ${CATEGORY_LABELS[listing.category]}`);
    if (input.area !== "all") reasons.push(`Područje: ${listing.area}`);
    if (budget.state === "ok" && total !== null) {
      reasons.push(`Ukupni trošak ${total} € unutar proračuna od ${budget.value} €`);
    }
    if (fromIntent.length) reasons.push(`Riječi iz vašeg upita: ${fromIntent.join(", ")}`);
    if (fromProfile.length) reasons.push(`Riječi iz profila: ${fromProfile.join(", ")}`);
    if (reasons.length === 0) reasons.push("Nema aktivnih filtera ni upita, prikazan je cijeli demo skup");
    results.push({
      listing,
      total,
      matchedFromIntent: fromIntent,
      matchedFromProfile: fromProfile,
      reasons,
    });
  }

  results.sort((a, b) => {
    const sa = a.matchedFromIntent.length * 2 + a.matchedFromProfile.length;
    const sb = b.matchedFromIntent.length * 2 + b.matchedFromProfile.length;
    if (sb !== sa) return sb - sa;
    return a.listing.id < b.listing.id ? -1 : 1;
  });

  return { results, budget, hiddenUnknownPrice, noWordMatch, queryWordCount, notes };
}

export function formatPrice(l: Listing): string {
  if (l.price === null) return l.priceNote ?? "Cijena nije navedena";
  if (l.price === 0) return "Besplatno";
  if (l.category === "rental") {
    const u = l.utilities === null ? "režije nisu navedene" : `režije ${l.utilities} €`;
    return `${l.price} € najam, ${u}`;
  }
  return `${l.price} €${l.priceNote ? ` (${l.priceNote})` : ""}`;
}

/**
 * Croatian editable draft. Uses only text the user supplied (intent, profile)
 * and, if chosen, the selected demo listing's displayed facts. Nothing is invented or translated.
 */
export function buildDraft(args: {
  intent: string;
  profile: string;
  useProfile: boolean;
  listing?: Listing | null;
}): string {
  const intent = args.intent.trim();
  const profile = args.useProfile ? args.profile.trim() : "";
  const lines: string[] = ["Bok!", ""];
  if (intent) lines.push(`Što trebam ili nudim: ${intent}`);
  else lines.push("Što trebam ili nudim: [upišite svojim riječima]");
  if (profile) lines.push("", `O meni (iz mog potvrđenog profila): ${profile}`);
  if (args.listing) {
    const l = args.listing;
    lines.push(
      "",
      `Povezano s demo primjerom "${l.title}"${l.area ? ` (${l.area})` : ""}: ${formatPrice(l)}.`,
    );
  }
  lines.push(
    "",
    "Područje: [upišite]",
    "Proračun ili cijena: [upišite]",
    "Rok ili termin: [upišite]",
    "Kontakt: [upišite kako želite da vas kontaktiraju]",
    "",
    "Hvala!",
  );
  return lines.join("\n");
}

export interface SavedStore {
  load(): { ids: string[]; error: string | null };
  save(ids: string[]): string | null;
}

const KEY = "sma.search.saved.v1";

export function createSavedStore(storage?: Pick<Storage, "getItem" | "setItem">): SavedStore {
  return {
    load() {
      try {
        const s = storage ?? globalThis.localStorage;
        const raw = s.getItem(KEY);
        if (!raw) return { ids: [], error: null };
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return { ids: [], error: "Spremljeni podaci su neispravni pa su zanemareni." };
        return { ids: parsed.filter((x): x is string => typeof x === "string"), error: null };
      } catch {
        return { ids: [], error: "Spremanje u pregledniku nije dostupno ili su podaci oštećeni." };
      }
    },
    save(ids) {
      try {
        const s = storage ?? globalThis.localStorage;
        s.setItem(KEY, JSON.stringify(ids));
        return null;
      } catch {
        return "Spremanje nije uspjelo (preglednik blokira pohranu). Stavke ostaju samo do zatvaranja.";
      }
    },
  };
}
