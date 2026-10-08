# Railway source registry and public preview acceptance

Observed 2026-10-08 at 14:10 UTC.

## Delivered
- Public URL: https://frontend-production-af62.up.railway.app
- Frontend commit 8bb003d, deployment f78a77e7-ec8b-44dd-ba76-6b17733fe086, SUCCESS.
- Backend commit cabac6f, deployment 0ab5622b-987d-41fd-88f8-06057f4c2ab4, SUCCESS.
- Managed PostgreSQL schema migrated and 21 source records seeded. Startup observed twice with idempotent seed. Real frontend/private backend/database reads pass.
- Public access expires 2026-10-08T22:00:00Z, midnight Zagreb. Thereafter configured preview Basic authentication applies. Services are not automatically deleted or billing stopped.

## Direct acceptance evidence
- live-checks.json: eight public HTTP assertions passed: unauthenticated page and health, all 21 persisted sources, Croatian alias lookup, two Sesvete groups, exact map selection, cross-site write rejection, absent public import bridge.
- browser-checks.json: real public Chromium run completed three semantic profile turns using actual configured provider plus Maksimir selection. Four turns passed, no browser page errors. public-desktop.png and public-completed.png capture actual public site.
- Backend domain list returned no domains. PostgreSQL TCP proxy list returned no proxies. Backend token is only used server-side by the narrow read-only registry bridge.
- Local backend regression suite previously passed 176 tests. Frontend deployment access suite passed four tests including expiry. Railway production frontend build and typechecking passed.
- Backend first deployment failed readiness because its IPv6-only listener did not serve IPv4 health probes. Explicit dual-stack socket fixed this. Local IPv4 and IPv6 health requests passed, then Railway /ready returned 200 and deployment succeeded.

## Scope and limits
- Nineteen Facebook source names, sixteen ordered share URLs, three missing URLs, and two general Reddit source URLs. Ordered URL-to-name mappings remain explicitly unverified.
- No Facebook posts were collected. Local Reddit posts and synthetic fixtures were not copied to cloud. This is a source registry, not an imported Facebook content corpus.
- Public frontend is the last coherent committed main-page UI. The separate ongoing visual redesign was not committed or deployed by this session.
- Real microphone streaming was not re-tested against the public deployment. Typed semantic extraction and map routing were tested live.
- Public paid API guard is a single-process demonstration rate limit, not a durable billing cap.
- No secrets printed or committed. Generated preview credentials remain local in gitignored mode-0600 .env.railway.
