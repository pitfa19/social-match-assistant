export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Narrow server-side bridge. Never forwards collection, imports or admin calls. */
export async function GET(request: Request) {
  const base = process.env.BACKEND_URL;
  const token = process.env.BACKEND_ACCESS_TOKEN;
  if (!base || !token) return Response.json({ error: "Izvori trenutačno nisu dostupni." }, { status: 503 });
  const input = new URL(request.url);
  const target = new URL("/matching/sources", base);
  for (const key of ["area", "include_general"]) {
    const value = input.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }
  try {
    const result = await fetch(target, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!result.ok) return Response.json({ error: "Izvori trenutačno nisu dostupni." }, { status: result.status === 422 ? 400 : 503 });
    return Response.json(await result.json(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Izvori trenutačno nisu dostupni." }, { status: 503 });
  }
}
