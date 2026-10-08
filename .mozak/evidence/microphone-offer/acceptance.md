# Clean listing text and microphone rental acceptance

Owner requests on October 8, 2026: remove visible demo tags at 16:10:58 UTC, then add a separate microphone-rental offer at 16:12:26 UTC. These display instructions supersede earlier visible-demo-label requirements, without changing internal provenance or production isolation.

- Removed `[DEMO]` titles, demo badge and explanatory synthetic disclaimers from cards. Replaced placeholder bodies with natural Croatian advertisement copy. Cards display `Oglas · Trešnjevka`; internally they still carry `source: demo`, `recordKind: synthetic`, stable ids and null URLs.
- Added **Luka iznajmljuje mikrofon na Trešnjevci** as `demo-microphone-rental-tresnjevka`. Offers microphone rental for recording vocals/music, short-term availability and pickup/price by arrangement. No invented real contact, price or equipment specification.
- Bare `Tražim mikrofon` and explicit rental requests match. Music interest alone, offer-role facts, negation, explicit purchase and wrong area do not. Existing Ivo and Maja offers still match independently.

## Observed verification, 16:13-16:14 UTC

- `npm test`: 115 passed, 0 failed. `npm run typecheck`: passed.
- `node scripts/verify-demo-api.mjs`: 15 real HTTP boundary checks passed. Microphone-only and rental requests returned Luka alone; combined three needs returned Ivo, Maja and Luka. Existing exclusions returned no demo rows, bad area and client config injection returned 400, cross-origin returned 403.
- `LIVE_PROFILE=1 WITH_MICROPHONE=1 CHROME_PATH=/home/pitfa/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome node scripts/verify-demo-offers.mjs`: passed. Three real provider calls, no stubs. Submitted profile includes `Tražim i mikrofon.` and selects Trešnjevka. Real local backend available. Exactly all three ids returned and rendered. Explicit DOM assertions confirmed no demo, fictional or synthetic wording in any of the three cards. Layout passed at 1440, 375 and 320 px, no runtime errors or horizontal overflow.
- Before adding Luka, the revised two-card display also passed browser checks, 114 unit tests and the original 11 public API checks. That browser run stubbed only extraction; the subsequent three-card run above used the real provider.

Local-development-only overlay and opt-in are unchanged. No real database records, collection, external posting, credentials or deployment changed. These remain fictional examples even though the owner requested clean display text. No general semantic-ranking or production acceptance claim is made.
