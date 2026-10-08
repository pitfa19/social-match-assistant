# Published redesign acceptance

Observed on 2026-10-08 at 14:20-14:24 UTC.

## Delivered

- Public HTTPS URL: https://kvartnakvadrat.up.railway.app
- Railway frontend deployment `30932e10-4609-41e3-876d-4c0e09e2e30d`: SUCCESS.
- Uploaded immutable git archive `c46e8a07138c0609846da41caa037201d7f0470c`, including design implementation `54168887aacf73ee7a964cb2fb276b65dbbe6927` and branding. Root Docker context, existing frontend service only. Uncommitted unrelated work was not uploaded.
- Renamed existing Railway service domain from `frontend-production-af62.up.railway.app` to the owner-requested `kvartnakvadrat.up.railway.app`. New domain ACTIVE, target port 3000. The old shared address is replaced, not retained as an alias.

## Current public acceptance

- `live-checks.json`: 8 live HTTPS checks passed, including unauthenticated page and health, private-backend persistent source registry, neighbourhood filtering, typed Maksimir selection, cross-site rejection, and absence of public import bridge.
- `browser/results.json`: all 37 design browser assertions passed against the actual deployed application. Answer APIs are fixtures in this harness, not live-provider evidence. Actual SVG geometry, district and local-committee selection, interrupted camera, no map tile requests, notes timing, motion, reduced motion, errors, keyboard operation, and mobile layouts are exercised. Welcome and Maksimir screenshots were visually reviewed.
- `safety/safety-results.json`: actual public typed provider flow passed, including semantic negation/third-party filtering and explicit local committee Brezovica, permission denial, origin guards, and cancellation cleanup. The unavailable-provider subcase deliberately uses a 503 fixture.

## Voice limitation retained, not hidden by passing design checks

Two public real-provider voice runs each committed all four synthetic spoken answers with one microphone start and no uncaught page errors. Three semantic profile responses returned HTTP 200. Both runs transcribed the final neighbourhood as `Maximir` instead of `Maksimir`; the resolver returned HTTP 200 with `status: clarify`, and the app correctly stayed on the question instead of inventing a region. The strict automatic voice-to-map assertion timed out on both runs. Evidence is retained in `voice/failed-run.json` and `voice-repeat/failed-run.json`. This is NOT a fully passing public voice-to-map test and NOT a speech-accuracy claim. The separately exercised actual typed route and map flow pass. No recognition/resolver changes were silently added to the authorized deployment scope.

## Preserved infrastructure and access policy

- Backend deployment remains `0ab5622b-987d-41fd-88f8-06057f4c2ab4`, SUCCESS. No backend/database redeployment or configuration script rerun.
- Only nonsecret policy fields were retained in `public-policy.json`: `APP_REQUIRE_AUTH=true`, private `BACKEND_URL`, and `PUBLIC_PREVIEW_UNTIL=2026-10-08T22:00:00Z` unchanged.
- Public access expires at 00:00 on October 9, 2026 in Zagreb, then the existing Basic preview gate applies. This is an access expiry, not automatic service shutdown or billing termination. The future time transition was not waited for during this verification.
- Registry remains 21 source records (19 Facebook, 2 Reddit), including 3 missing Facebook URLs and 16 tentative links. No Facebook content was imported, and source links are not represented as verified.

## Repository follow-through

The public verifier default hostname is updated and the design verifier now accepts an isolated evidence directory. These are test-helper changes only and do not require another application deployment. Scope records and raw artifacts are hash-pinned in the completed MOZAK successor plan. Earlier sealed design evidence was not overwritten.
