import { genericError, json, rateLimited, readCapped, sameOriginOnly, TooLarge } from "../../../../features/zagreb/server/guard";
import { MAX_ANSWER_LEN, PROFILE_STEPS } from "../../../../features/zagreb/profileLogic";
import { buildRequest, parseAdaptiveResponse } from "../../../../features/zagreb/server/semanticProfile";

export const runtime = "nodejs";

const MAX_BODY = 8192;

// POST { step: 0|1|2, text: string }
//  -> 200 { status: "ok", items: [{ text, topic }] }   text is a concise Croatian semantic fact grounded in a verified evidence quote, topic is a fixed id or "none"
//  -> 200 { status: "empty", items: [] }              nothing grounded and positive was found
//  -> 400/413/429/502/503 { error }
export async function POST(request: Request): Promise<Response> {
  const denied = sameOriginOnly(request);
  if (denied) return denied;
  if (rateLimited(request, "profile", 40)) return json({ error: "Previše pokušaja. Pričekaj trenutak." }, 429);

  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: "Obrada odgovora trenutno nije dostupna." }, 503);

  let text = "";
  let step = -1;
  try {
    const bytes = await readCapped(request, MAX_BODY);
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { text?: unknown; step?: unknown };
    if (typeof parsed.text === "string") text = parsed.text.trim();
    if (typeof parsed.step === "number") step = parsed.step;
  } catch (e) {
    if (e instanceof TooLarge) return json({ error: "Tekst je predug." }, 413);
    return json({ error: "Neispravan zahtjev." }, 400);
  }
  if (!Number.isInteger(step) || step < 0 || step >= PROFILE_STEPS) return json({ error: "Neispravan zahtjev." }, 400);
  if (!text) return json({ error: "Upiši ili reci odgovor." }, 400);
  if (text.length > MAX_ANSWER_LEN) return json({ error: "Tekst je predug." }, 413);

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(buildRequest(step, text)),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return genericError();
    // Refusal, incomplete or schema-invalid output is an error (retryable), never a silent empty success.
    const result = parseAdaptiveResponse(await res.json(), text);
    if (!result) return genericError();
    return json({ status: result.items.length ? "ok" : "empty", ...result });
  } catch {
    return genericError();
  }
}
