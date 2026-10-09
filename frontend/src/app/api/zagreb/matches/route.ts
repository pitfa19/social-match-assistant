import { json, rateLimited, readCapped, sameOriginOnly, TooLarge } from "../../../../features/zagreb/server/guard";
import { validateMatchInput } from "../../../../features/zagreb/server/indexedMatches";
import { matchDemoOffers } from "../../../../features/zagreb/server/demoOffers";

export const runtime = "nodejs";

/** Demo search. Serves labelled synthetic offers only. It does not call the MCP server or any live source. */
export async function POST(request: Request): Promise<Response> {
  const denied = sameOriginOnly(request);
  if (denied) return denied;
  if (rateLimited(request, "matches", 40)) return json({ error: "Previše pretraga. Pričekaj trenutak." }, 429);
  let input;
  try { input = validateMatchInput(JSON.parse(new TextDecoder().decode(await readCapped(request, 12000)))); }
  catch (e) { return json({ error: e instanceof TooLarge ? "Upit je predug." : "Neispravan upit." }, e instanceof TooLarge ? 413 : 400); }
  if (!input) return json({ error: "Neispravan upit." }, 400);
  return json({ results: matchDemoOffers(input), sources: [], truncated: false, searched: true,
    indexAvailable: true, sourcesAvailable: false });
}
