import { buildIndexedQueries, parseIndexResults, parseSources, type SearchFact, type MatchResponse } from "../indexedSearch.ts";
import { findNeighbourhood } from "../neighbourhoods.ts";

export type MatchInput = { areaId: string; cityWide: boolean; facts: SearchFact[] };
export function validateMatchInput(raw: unknown): MatchInput | null {
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d !== "object" || Object.keys(d).some((k) => !["areaId", "cityWide", "facts"].includes(k)) ||
      typeof d.areaId !== "string" || !findNeighbourhood(d.areaId) || typeof d.cityWide !== "boolean" ||
      !Array.isArray(d.facts) || d.facts.length > 24) return null;
  const facts: SearchFact[] = [];
  for (const f of d.facts) {
    if (!f || typeof f.text !== "string" || f.text.length > 160 ||
        !["description", "interest", "request", "offer"].includes(f.role)) return null;
    facts.push({ text: f.text.trim(), role: f.role });
  }
  return { areaId: d.areaId, cityWide: d.cityWide, facts };
}

/** Read-only fixed-path bridge. No collection, imports, scoring calls, corpus selection or credentials from the client. */
export async function fetchIndexedMatches(input: MatchInput, config: { base: string; token: string; corpus?: string },
  signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<MatchResponse> {
  const area = findNeighbourhood(input.areaId)!;
  const queries = buildIndexedQueries(input.facts, input.cityWide ? null : area.id);
  const headers = { authorization: `Bearer ${config.token}`, "content-type": "application/json" };
  const read = async (path: string, body?: unknown): Promise<unknown | null> => {
    try {
      const r = await fetcher(new URL(path, config.base), { headers, signal, cache: "no-store",
        method: body ? "POST" : "GET", ...(body ? { body: JSON.stringify(body) } : {}) });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  };
  const corpus = config.corpus && /^[a-z0-9_.-]{1,60}$/.test(config.corpus) ? config.corpus : "main";
  const [indexRows, sourceRows] = await Promise.all([
    Promise.all(queries.map(async (query) => parseIndexResults(await read("/matching/retrieve", {
      corpus, mode: "indexed", max_candidates: 12, query,
    })))),
    read(`/matching/sources?area=${encodeURIComponent(area.name)}&include_general=true`).then(parseSources),
  ]);
  const found = indexRows.flatMap((r) => r?.results ?? []);
  const unique = [...new Map(found.map((r) => [r.id, r])).values()];
  return { results: unique.slice(0, 12), sources: sourceRows ?? [],
    truncated: unique.length > 12 || indexRows.some((r) => r?.truncated), searched: queries.length > 0,
    indexAvailable: indexRows.every((r) => r !== null), sourcesAvailable: sourceRows !== null };
}
