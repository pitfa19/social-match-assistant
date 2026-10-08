# Trešnjevka: two local synthetic demo offers

Owner request: October 8, 2026, 16:02:12 UTC. Add two separate fictional offers for a profile seeking dog walking and pipe repair on Trešnjevka. This supersedes the no-synthetic-display boundary only for this explicitly opted-in local demonstration, not for real imported results or production.

## Delivered

- `demo-pipe-repair-tresnjevka`: **[DEMO] Ivo nudi popravak cijevi u stanu**. Fictional male handyman offering minor plumbing repairs.
- `demo-dog-walking-tresnjevka`: **[DEMO] Maja nudi šetanje pasa u susjedstvu**. Fictional female neighbour offering dog walks.
- Separate cards, `recordKind: synthetic`, `source: demo`, no real contacts or links. The cards explicitly say the people and offers are not real.
- An in-memory server overlay is enabled only by `NODE_ENV=development` and `LOCAL_DEMO_OFFERS=1`. The flag is enabled in ignored `frontend/.env.development.local`. Remove it or set it to `0` to disable. Production remains excluded even with the flag set.
- Area is exactly the catalogue's colloquial `tresnjevka`. These examples do not invent a precise north/south district or street. Only positive request facts for the offered services match. Music and biography alone do not match.
- Real corpus rows, imported source content, database, deployment and provider configuration were not modified. Existing local backend availability and real results remain honestly reported. This is a curated demo matcher, not evidence of general semantic ranking quality.

## Verification observed

- `npm test`: 114 tests passed, 0 failed, including fixture matching, ASCII/Croatian variants, combined and separated needs, wrong area, negative/unrelated/offer facts, production exclusion, opt-in, original result preservation and result cap.
- `npm run typecheck`: passed.
- `CHROME_PATH=/home/pitfa/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome node scripts/verify-demo-offers.mjs`: passed against running localhost preview and real local matching endpoint, with backend available, exactly two demo ids above, visible synthetic labels, no browser runtime errors or horizontal overflow at 1440, 375 and 320 px.
- Profile extraction was stubbed for the three answers in that browser check to avoid paid provider calls. No fresh provider-backed interpretation claim is made. The owner will manually test their profile.
- Initial browser attempt could not find Playwright's default browser revision. Reused already installed Chromium successfully without installation.
- MOZAK overview validated the new input/plan artifacts. Existing unpinned historical evidence warnings are unrelated and unchanged.

## Repository boundaries

The integration commit also preserves the already authorized and user-tested local-posts matching changes in `IndexedResults.tsx`, `indexedSearch.ts`, `server/indexedMatches.ts`, and `adaptiveIndexed.test.ts`. Those changes were present before this demo request and are required by the current candidate schema. Unrelated profile redesign files, generated files, design scripts and ignored settings are not included.

Original collection remains partial as recorded in the predecessor collection contract. This demo does not collect data, repair missing group links, or close that commitment.
