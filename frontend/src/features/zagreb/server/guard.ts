// Shared request guards for the Zagreb routes. Server only.
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function genericError(status = 502): Response {
  return json({ error: "Nešto je pošlo po zlu. Pokušaj ponovno ili upiši kvart." }, status);
}

/** Reject anything that is not a same-origin browser request. */
export function sameOriginOnly(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return json({ error: "Zabranjeno." }, 403);
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return json({ error: "Zabranjeno." }, 403);
  }
  if (originHost !== host) return json({ error: "Zabranjeno." }, 403);
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return json({ error: "Zabranjeno." }, 403);
  return null;
}

export class TooLarge extends Error {}

/** Read the body with a hard byte cap, even without Content-Length. */
export async function readCapped(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new TooLarge();
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new TooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

/** Tiny in-memory per-IP limiter. Demo grade, per server instance. */
const hits = new Map<string, number[]>();
export function rateLimited(request: Request, bucket: string, max = 20, windowMs = 60_000): boolean {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}
