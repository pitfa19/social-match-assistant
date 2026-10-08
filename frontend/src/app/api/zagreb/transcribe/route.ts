import { genericError, json, rateLimited, readCapped, sameOriginOnly, TooLarge } from "../../../../features/zagreb/server/guard";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024; // ~ well over 15 s of opus
const ALLOWED = /^(audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac)|video\/webm)(;|$)/i;

export async function POST(request: Request): Promise<Response> {
  const denied = sameOriginOnly(request);
  if (denied) return denied;
  if (rateLimited(request, "stt")) return json({ error: "Previše pokušaja. Pričekaj trenutak." }, 429);

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return json({ error: "Govor trenutno nije dostupan. Upiši kvart." }, 503);

  let form: FormData;
  try {
    const bytes = await readCapped(request, MAX_BYTES + 64 * 1024);
    const type = request.headers.get("content-type") || "";
    if (!type.toLowerCase().startsWith("multipart/form-data")) return json({ error: "Neispravan zahtjev." }, 400);
    form = await new Response(bytes as BodyInit, { headers: { "content-type": type } }).formData();
  } catch (e) {
    if (e instanceof TooLarge) return json({ error: "Snimka je preduga." }, 413);
    return json({ error: "Neispravan zahtjev." }, 400);
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size < 200) return json({ error: "Snimka je prazna." }, 400);
  if (audio.size > MAX_BYTES) return json({ error: "Snimka je preduga." }, 413);
  if (!ALLOWED.test(audio.type)) return json({ error: "Nepodržan format zvuka." }, 415);

  const upstream = new FormData();
  upstream.set("model_id", "scribe_v2");
  upstream.set("language_code", "hrv");
  upstream.set("tag_audio_events", "false");
  upstream.set("file", audio, "snimka");

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: upstream,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return genericError();
    const data = (await res.json()) as { text?: unknown };
    const text = typeof data.text === "string" ? data.text.trim().slice(0, 300) : "";
    if (!text) return json({ error: "Nisam ništa čuo. Pokušaj ponovno ili upiši kvart." }, 422);
    return json({ text });
  } catch {
    return genericError();
  }
}
