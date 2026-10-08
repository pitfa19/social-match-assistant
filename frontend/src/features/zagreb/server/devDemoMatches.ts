import type { MatchInput } from "./indexedMatches.ts";
import type { MatchResponse } from "../indexedSearch.ts";
import { matchDemoOffers } from "./demoOffers.ts";

/** Explicit local-development overlay. Never imports fixtures into the real corpus. */
export function withLocalDemoOffers(input: MatchInput, result: MatchResponse,
  env: { NODE_ENV?: string; LOCAL_DEMO_OFFERS?: string }): MatchResponse {
  if (env.NODE_ENV !== "development" || env.LOCAL_DEMO_OFFERS !== "1") return result;
  const demo = matchDemoOffers(input);
  if (!demo.length) return result;
  const combined = [...demo, ...result.results];
  return { ...result, results: combined.slice(0, 12), searched: true,
    truncated: result.truncated || combined.length > 12 };
}
