# Profile flow acceptance: October 8, 2026

## Delivered scope
- Initial page opens directly into the silent Predstavi se dialog. No automatic microphone request.
- The three approved Croatian questions run sequentially, followed by Koji kvart te zanima?. Blank input does not advance.
- Each successful profile answer adds grounded sentence notes and fixed topic tags on the left. Every item is a removable button. Removed keys stay removed during subsequent answers.
- A resolved neighbourhood reveals the map on the right with zoom and an explicitly approximate 700 m highlight, while notes remain. The highlight is not an administrative boundary.
- Personal notes live in component memory only and clear on reload. Closing returns to the existing hero; reopening begins a fresh introduction.

## Direct evidence
- Coordinator production build and typecheck passed. Unit suite: 23/23, including question order, negation, verbatim non-truncating extraction, deduplication, and deletion permanence.
- `scripts/verify-profile-flow.mjs`: six complete checks passed against production localhost:3101 with real OpenAI Decisions and ElevenLabs calls. Three typed profile answers generated notes, fact and topic removal survived later answers, unknown quartier did not show map, synthetic Croatian microphone audio selected Maksimir and revealed zoom14.60/highlight on right, notes remained, and mobile/reload checks passed. No page exceptions.
- `scripts/verify-profile-safety.mjs`: four checks passed. Same-origin/input guards, live negation and third-party extraction test, simulated provider failure preserves answer/question for retry, microphone denial keeps typing available.
- Screenshots and JSON results under `browser/`. Synthetic test statements are not real owner profile data.
- Exact supplied key value scan over frontend/src and .next/static passed. Keys remain ignored server-only local environment data.
- Production preview refreshed at http://127.0.0.1:3101, loopback only. Host automatic-opening restriction is unchanged.

## Mechanics and boundaries
Decisions selects explicit self-statement sentence candidates and fixed topic categories. It does not generate free-form paraphrases. Notes keep original meaning and negative preferences, with no positive topic for negated statements. Third-party statements are excluded. Facts and topics can each be removed independently. Sentences are not truncated mid-meaning. Existing legacy frontend dirty work and backend pilot files were not modified.

Real provider calls were used with synthetic Croatian audio and synthetic text. Physical microphone and broad natural Croatian speech quality are not claimed. Previous single-question browser scripts remain historical and are superseded for this flow by the two new profile scripts. No public deployment, profile database, social integration changes, or additional provider was introduced.
