import { genericError, json, rateLimited, sameOriginOnly } from "../../../../features/zagreb/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mints a short-lived single-use realtime Scribe token. The master key never leaves the server. */
export async function POST(request: Request): Promise<Response> {
  const denied = sameOriginOnly(request);
  if (denied) return denied;
  if (rateLimited(request, "stt-token", 6, 60_000)) return json({ error: "Previše pokušaja. Pričekaj trenutak." }, 429);

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return json({ error: "Govor trenutno nije dostupan. Upiši odgovor." }, 503);

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
      method: "POST",
      headers: { "xi-api-key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return genericError();
    const data = (await res.json()) as { token?: unknown };
    if (typeof data.token !== "string" || !data.token) return genericError();
    return json({ token: data.token });
  } catch {
    return genericError();
  }
}
