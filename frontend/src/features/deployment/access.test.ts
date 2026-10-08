import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentAccess } from "./access.ts";

test("local development remains available", () => assert.equal(deploymentAccess(null, {}), "allowed"));
test("Railway fails closed without access credentials", () => assert.equal(deploymentAccess(null, { RAILWAY_ENVIRONMENT_ID: "production" }), "unconfigured"));
test("public preview expires at the configured deadline", () => {
  const env = { APP_REQUIRE_AUTH: "true", PUBLIC_PREVIEW_UNTIL: "2026-10-08T22:00:00Z" };
  assert.equal(deploymentAccess(null, env, Date.parse("2026-10-08T21:59:59Z")), "allowed");
  assert.equal(deploymentAccess(null, env, Date.parse("2026-10-08T22:00:00Z")), "unconfigured");
  assert.equal(deploymentAccess(null, { ...env, PUBLIC_PREVIEW_UNTIL: "invalid" }), "unconfigured");
});
test("configured preview requires valid Basic authentication", () => {
  const env = { APP_REQUIRE_AUTH: "true", SITE_ACCESS_USER: "owner", SITE_ACCESS_PASSWORD: "a-long-test-password-for-preview" };
  assert.equal(deploymentAccess(null, env), "unauthorized");
  assert.equal(deploymentAccess("Basic !!!", env), "unauthorized");
  const basic = (s: string) => `Basic ${Buffer.from(s).toString("base64")}`;
  assert.equal(deploymentAccess(basic("owner:wrong"), env), "unauthorized");
  assert.equal(deploymentAccess(basic(`owner:${env.SITE_ACCESS_PASSWORD}`), env), "allowed");
});
