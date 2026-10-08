import type { MatchInput } from "./indexedMatches.ts";
import type { MatchResponse } from "../indexedSearch.ts";
import { matchDemoOffers } from "./demoOffers.ts";

/** Explicit server-owned demo overlay. Never imports fixtures into the real corpus. */
export function withLocalDemoOffers(input: MatchInput, result: MatchResponse,
  env: { NODE_ENV?: string; LOCAL_DEMO_OFFERS?: string; HOSTED_DEMO_OFFERS?: string }): MatchResponse {
  const local = env.NODE_ENV === "development" && env.LOCAL_DEMO_OFFERS === "1";
  const hosted = env.NODE_ENV === "production" && env.HOSTED_DEMO_OFFERS === "1";
  if (!local && !hosted) return result;
  const demo = matchDemoOffers(input);
  if (!demo.length) return result;
  const combined = [...demo, ...result.results];
  return { ...result, results: combined.slice(0, 12), searched: true,
    truncated: result.truncated || combined.length > 12 };
}
