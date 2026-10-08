import { createHash, timingSafeEqual } from "node:crypto";

export function deploymentAccess(authorization: string | null, env: Record<string, string | undefined> = process.env, now = Date.now()): "allowed" | "unauthorized" | "unconfigured" {
  if (!env.RAILWAY_ENVIRONMENT_ID && env.APP_REQUIRE_AUTH !== "true") return "allowed";
  const publicUntil = Date.parse(env.PUBLIC_PREVIEW_UNTIL ?? "");
  if (Number.isFinite(publicUntil) && now < publicUntil) return "allowed";
  const user = env.SITE_ACCESS_USER;
  const password = env.SITE_ACCESS_PASSWORD;
  if (!user || !password || password.length < 20) return "unconfigured";
  if (!authorization?.startsWith("Basic ") || authorization.length > 2048) return "unauthorized";
  const actual = Buffer.from(authorization.slice(6), "base64");
  const expected = Buffer.from(`${user}:${password}`);
  const digest = (value: Buffer) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(actual), digest(expected)) ? "allowed" : "unauthorized";
}
