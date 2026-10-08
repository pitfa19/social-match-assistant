# Railway three-offer acceptance

Observed 2026-10-08, public acceptance run 16:27:37 to 16:28:04 UTC. Owner authorized deployment at 16:16:36 UTC. Public target: https://kvartnakvadrat.up.railway.app.

## Delivered release

- Application source: 2839e0a1a6d482af5a8597ba8c02857a13995893, uploaded as a clean git archive. Unrelated dirty working-tree edits and local secrets were excluded.
- Backend deployment e82882a1-39b2-46b3-bac6-6408a5fd83ff: SUCCESS, image sha256:7d866195432a6f31bedfeaa4e319b47edf0e0ec83974b80493dae2e6ebaced0f.
- Frontend deployment 3af39234-1847-48be-86ef-09a38529d4d5: SUCCESS, image sha256:cb83c83666ec0bff12df6f49292ca8d2e883b21dbd1f5aa840ec1146e39ab134. Independently confirmed with Railway deployment list after completion.
- HOSTED_DEMO_OFFERS=1 confirmed after deployment. APP_REQUIRE_AUTH=true and PUBLIC_PREVIEW_UNTIL=2026-10-08T22:00:00Z are unchanged. Preview is open until midnight Zagreb at the end of October 8; afterwards the existing Basic-auth gate applies.

## Direct public acceptance

Both commands ran from frontend/ against APP_URL=https://kvartnakvadrat.up.railway.app, not localhost. Full generated outputs are public-api.json and public-browser.json in this directory.

1. `node scripts/verify-demo-api.mjs`: all 15 HTTP checks passed. Combined original needs returned Ivo and Maja; individual dog and pipe requests each returned their appropriate offer. Bare microphone and rental requests returned Luka; all three needs returned all three. Purchase-only microphone, wrong neighbourhood, music-only, offer-role, negated and empty profiles returned no examples. Unknown area and client configuration injection returned 400; cross-origin request returned 403. Successful queries asserted backend/index availability.
2. `LIVE_PROFILE=1 WITH_MICROPHONE=1 CHROME_PATH=/home/pitfa/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome node scripts/verify-demo-offers.mjs`: real deployed onboarding, three actual provider requests, zero stubbed requests, then Trešnjevka selection and real matching response. All three expected cards rendered: Ivo pipe repair, Maja dog walking, Luka microphone rental. Clean visible copy and metadata assertions passed. Internal synthetic provenance and null source URLs were retained. Widths 1440, 375 and 320 passed without page errors or horizontal overflow.

The browser script's static JSON labels still say `local-demo-offers-browser` and `real-local-api`; these are legacy labels, not target selection. Its actual page navigation uses APP_URL, explicitly set to the public Railway URL in this recorded invocation. No request interception was installed in LIVE_PROFILE mode.

## Safety and regression evidence

- 116 frontend tests, TypeScript check, and clean-snapshot production build passed before upload. Backend read-only reviewer reported 194 tests passed.
- After backend deployment, private /ready returned HTTP 200. Remote read-only SQL confirmed 121 main/live_imported rows, 121 indexed search vectors, ordered aggregate content_hash MD5 dfccef5475b33d8bd0ed7d6089231ee4, identical to the pre-deploy baseline. Existing two migrations and 21 source registry entries remained.
- Examples are a frontend in-memory overlay, not database imports. No DB import, credential rotation, public backend/Postgres exposure, preview extension, or changes to unrelated local work were performed.
- Snapshot packaging, real backend integration, provider-backed extraction, positive and negative matching boundaries, security input rejection and responsive card rendering were checked. Voice input was not exercised in this deployment check; no voice acceptance claim is made.

## Scope and interpretation

The owner's request was interpreted as publishing the currently committed app plus the three requested examples to the already-existing Railway services. Explicit production opt-in was necessary because local-only examples were otherwise absent in production. Unrelated uncommitted UI work was deliberately not deployed. The older Facebook collection remains PARTIAL with five missing group URLs and is not completed by this release.

All requested deployment acceptance outcomes were observed on the public app. Stop reason: both releases healthy, public real-provider flow and HTTP edge checks pass, existing database digest and access policy preserved. Remaining known limitation is the pre-existing preview expiry, not a deployment failure.
