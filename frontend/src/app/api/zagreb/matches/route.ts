import { json, rateLimited, readCapped, sameOriginOnly, TooLarge } from "../../../../features/zagreb/server/guard";
import { fetchIndexedMatches, validateMatchInput } from "../../../../features/zagreb/server/indexedMatches";

export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  const denied = sameOriginOnly(request);
  if (denied) return denied;
  if (rateLimited(request, "matches", 40)) return json({ error: "Previše pretraga. Pričekaj trenutak." }, 429);
  let input;
  try { input = validateMatchInput(JSON.parse(new TextDecoder().decode(await readCapped(request, 12000)))); }
  catch (e) { return json({ error: e instanceof TooLarge ? "Upit je predug." : "Neispravan upit." }, e instanceof TooLarge ? 413 : 400); }
  if (!input) return json({ error: "Neispravan upit." }, 400);
  const base = process.env.BACKEND_URL, token = process.env.BACKEND_ACCESS_TOKEN;
  if (!base || !token) return json({ error: "Pretraga trenutačno nije dostupna." }, 503);
  const result = await fetchIndexedMatches(input, { base, token, corpus: process.env.MATCHING_CORPUS },
    AbortSignal.any([request.signal, AbortSignal.timeout(8000)]));
  return json(result);
}
