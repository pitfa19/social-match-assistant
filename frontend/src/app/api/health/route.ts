export const dynamic = "force-dynamic";
export function GET() {
  const protectedDeployment = !!process.env.RAILWAY_ENVIRONMENT_ID || process.env.APP_REQUIRE_AUTH === "true";
  const configured = !protectedDeployment || (!!process.env.SITE_ACCESS_USER && (process.env.SITE_ACCESS_PASSWORD?.length ?? 0) >= 20);
  return Response.json({ status: configured ? "ok" : "not_ready" }, { status: configured ? 200 : 503 });
}
