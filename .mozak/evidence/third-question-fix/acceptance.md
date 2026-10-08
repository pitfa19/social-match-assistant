# Third-question acceptance fix

## Delivered

- Owner report: 2026-10-08T15:02:24.930Z, third question does not accept answers. Solo execution, no new delegation.
- Application source: `eb24f1c40ae28546e70291aa34cfd0bbac78bbe0`.
- Railway frontend deployment: `6797481c-5e5e-43ca-973e-f317b48718b0`, observed SUCCESS.
- Public acceptance target: `https://kvartnakvadrat.up.railway.app`.
- Existing backend, database, environment, access controls and public-preview deadline were not changed.

## Cause and correction

The old client required semantic coverage of the current question before consuming the submitted turn. A real baseline third answer `Ne znam` returned HTTP 200, empty items and empty coverage (`before.json`), which left the question open. The owner's exact failing words were not supplied, so this is a reproduced blocking case rather than a claim to reproduce their exact session.

A successfully processed, nonblank profile answer now consumes the current question. Semantic coverage only skips additional questions already answered. Blank input remains disabled, provider errors remain retryable, and the final location still requires a valid selection. Empty extraction creates no notes. Stale turns and final-location application through the profile reducer remain ignored.

## Observed verification

1. `unit-tests.txt`: all 99 tests passed. `typecheck.txt` and `build.txt`: type check and production build succeeded on the final source.
2. `local/results.json`: 9 browser checks passed against the production build and real providers. Real `Ne znam` at step 2 returned empty coverage, advanced to the area question without inventing notes, and then Maksimir reached the map.
3. `public/results.json`: 9 checks passed on the deployed frontend. Normal sequential typing and a real streaming third voice answer each reached the area question and map. Microphone remained usable until completion and tracks stopped at completion. No browser errors.
4. `adaptive-regression/results.json`: 29 public regression checks passed. Real all-in-one extraction still skipped answered prompts, selected Maksimir with one profile call, and reached the existing private index and source registry. Real third-party/negation safety checks passed. Fixture-backed checks additionally covered stale responses, bounded caching, retry, layouts and empty/backend-error states.
5. `deployment-start.json` and `deployment-status.json` identify the immutable source deployment and SUCCESS status. The final public verification task completed on 2026-10-08 at 15:09Z.

## Limits and distinctions

- Model coverage is nondeterministic: public `Ne znam` returned coverage `[2]`, while the real local run and pre-fix baseline returned `[]`. The public fixture segment explicitly returned empty items and coverage for all three profile turns and verified progression without notes. This synthetic check supplements, not replaces, the real local empty-coverage observation.
- Voice used synthetic audio supplied as a MediaStream through actual ElevenLabs and semantic APIs. Some words were mistranscribed. This verifies progression and microphone lifecycle, not human speech-recognition accuracy or a usability study. The first two turns and final area were typed in this sequential voice regression.
- The production matching query returned zero candidates with `indexAvailable: true` and `sourcesAvailable: true`. Directory links are not imported posts. No new collection, import or backend deployment was performed.
- An already open tab needs refreshing to load the new client. Current onboarding answers are in memory and a refresh restarts that session.

All original requirements are mapped in `checkpoint.json`. The sequence checker audits declared completeness only. Direct acceptance evidence is in the captured browser results, response events, build logs and deployment records.
