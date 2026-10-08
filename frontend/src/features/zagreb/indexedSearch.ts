import { isNegated, normalize, type Note, type FactRole } from "./profileLogic.ts";

export type SearchFact = { text: string; role: FactRole };
export type IndexedQuery = { kind: "request" | "offer"; text: string; city: "Zagreb"; neighbourhood_id: string | null };
export type IndexedCandidate = { id: string; title: string; body: string; source: string; url: string | null; area: string | null; unknown: string[] };
export type CommunitySource = { id: string; name: string; platform: string; url: string | null; status: string };
export type MatchResponse = {
  results: IndexedCandidate[]; sources: CommunitySource[]; truncated: boolean;
  indexAvailable: boolean; sourcesAvailable: boolean; searched: boolean;
};

export function searchFacts(notes: Note[]): SearchFact[] {
  return notes.filter((n) => n.kind === "fact" && !isNegated(n.text)).slice(0, 24)
    .map((n) => ({ text: n.text, role: n.role ?? "description" }));
}

/** At most two complementary indexed queries. Need/offer text takes priority over broad biography. */
export function buildIndexedQueries(facts: SearchFact[], area: string | null): IndexedQuery[] {
  const positive = facts.filter((f) => f.text.trim() && !isNegated(f.text));
  const interests = positive.filter((f) => f.role === "interest");
  const makeText = (rows: SearchFact[]) => [...new Map(rows.map((r) => [normalize(r.text), r.text.trim()])).values()].join(". ").slice(0, 1000);
  const queries: IndexedQuery[] = [];
  for (const kind of ["request", "offer"] as const) {
    const own = positive.filter((f) => f.role === kind);
    if (own.length) queries.push({ kind, text: makeText(own), city: "Zagreb", neighbourhood_id: area });
  }
  if (!queries.length) {
    const text = makeText(interests.length ? interests : positive);
    if (text) queries.push({ kind: "request", text, city: "Zagreb", neighbourhood_id: area });
  }
  return queries;
}

/** Never render a script URL, credentials, or an opaque URL from indexed untrusted content. */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}

export function parseIndexResults(raw: unknown): { results: IndexedCandidate[]; truncated: boolean } | null {
  const d = raw as Record<string, unknown> | null;
  if (!d || d.mode !== "indexed" || !Array.isArray(d.results) || typeof d.truncated !== "boolean") return null;
  const results: IndexedCandidate[] = [];
  for (const r of d.results.slice(0, 12)) {
    // Synthetic benchmark content must never leak into the actual user's results.
    if (!r || r.record_kind === "synthetic" || !["live_imported", "user_contributed"].includes(r.record_kind) ||
        !["string", "number"].includes(typeof r.id) || typeof r.title !== "string") continue;
    results.push({ id: String(r.id), title: r.title.slice(0, 300), body: typeof r.body === "string" ? r.body.slice(0, 300) : "",
      source: ["reddit", "facebook", "user"].includes(r.source) ? r.source : "unknown", url: safeExternalUrl(r.url),
      area: typeof r.neighbourhood_id === "string" ? r.neighbourhood_id : null,
      unknown: Array.isArray(r.unknown_fields) ? r.unknown_fields.filter((v: unknown) => typeof v === "string").slice(0, 6) : [],
    });
  }
  return { results, truncated: d.truncated };
}

export function parseSources(raw: unknown): CommunitySource[] | null {
  const d = raw as { sources?: unknown } | null;
  if (!d || !Array.isArray(d.sources)) return null;
  return d.sources.slice(0, 24).flatMap((s) => s && typeof s.id === "string" && typeof s.name === "string" ? [{
    id: s.id, name: s.name.slice(0, 160), platform: s.platform === "facebook" ? "Facebook" : s.platform === "reddit" ? "Reddit" : "Zajednica",
    url: safeExternalUrl(s.canonical_url ?? s.url), status: typeof s.status === "string" ? s.status : "unknown",
  }] : []);
}
