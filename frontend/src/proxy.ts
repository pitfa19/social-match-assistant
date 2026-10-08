import { NextResponse, type NextRequest } from "next/server";
import { deploymentAccess } from "./features/deployment/access";

// One-replica public demo safeguard, not a billing limit. Restarts reset these counters.
let minute = { start: 0, count: 0 };
let hour = { start: 0, count: 0 };

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();
  const access = deploymentAccess(request.headers.get("authorization"));
  if (access === "unconfigured") return new NextResponse("Preview access is not configured.", { status: 503 });
  if (access === "unauthorized") return new NextResponse("Private preview", {
    status: 401, headers: { "WWW-Authenticate": 'Basic realm="Social match preview", charset="UTF-8"', "Cache-Control": "no-store" },
  });
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.get("sec-fetch-site") === "cross-site") {
    return new NextResponse("Cross-site request denied", { status: 403 });
  }
  if (request.method === "POST" && request.nextUrl.pathname.startsWith("/api/zagreb/") && process.env.PUBLIC_PREVIEW_UNTIL) {
    const now = Date.now();
    if (now - minute.start >= 60_000) minute = { start: now, count: 0 };
    if (now - hour.start >= 3_600_000) hour = { start: now, count: 0 };
    if (minute.count >= 60 || hour.count >= 300) return NextResponse.json({ error: "Testni limit je dosegnut. Pokušaj kasnije." }, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
    minute.count++;
    hour.count++;
  }
  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
