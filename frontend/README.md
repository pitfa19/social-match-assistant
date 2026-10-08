# Zagreb frontend runtime

The current `/` route is the Kvart na kvadrat experience. Older demo components and the root README's initial local-only phase are historical, not the current runtime contract. Use `mozak project context social-match-assistant` and its accepted plans for authority.

## Adaptive onboarding

`POST /api/zagreb/profile` extracts grounded notes, explicit question coverage and an optional canonical neighbourhood from the entire answer in one model request. Covered questions are skipped. An early neighbourhood remains remembered while any missing question is asked. A location-only final turn uses the existing neighbourhood route. Continuous voice awaits the same submit transaction used by typing.

## Existing indexed backend

Server-only environment variables:

- `BACKEND_URL`: existing private backend origin.
- `BACKEND_ACCESS_TOKEN`: existing private backend token. Never expose it through `NEXT_PUBLIC_*`.
- `MATCHING_CORPUS`: optional server-selected corpus, default `main`. Selecting a corpus does not copy or import records. Use only an approved existing corpus.

`POST /api/zagreb/matches` is a same-origin, rate-limited, bounded read bridge. It accepts profile facts, a catalogue area id and an optional city-wide search. The browser cannot select a corpus, arbitrary endpoint, retrieval mode or candidate limit.

Each search makes zero to two `mode: indexed` retrieval calls with at most 12 candidates and one source-directory read in parallel. Request/offer facts take priority over biography. There is no collection, import or paid relevance-scoring call. Results are lexical candidates, not confirmed matches. Unconfirmed location and availability are labelled. Source-directory links are not collected posts. Synthetic benchmark records are never rendered.

The UI debounces changes by 250 ms, aborts superseded fetches and tags outcomes to prevent stale results from replacing a newer selection. A component-local cache holds at most eight successful responses for 30 seconds. Camera movement and unsubmitted typing do not query the backend. Area selection, deleted facts and submitted refinements do. Retry bypasses the cache.

Area filtering uses the backend's exact neighbourhood id and its existing unknown-area eligibility rules. It does not imply district-to-local-committee expansion or geographic-distance ranking. The user can explicitly broaden to all Zagreb.

## Verification

From `frontend/`:

```sh
npm test
npm run typecheck
npm run build
BASE_URL=http://127.0.0.1:3103 node scripts/verify-adaptive-indexed.mjs
BASE_URL=http://127.0.0.1:3103 node scripts/verify-adaptive-partial.mjs
```

The browser scripts use local Playwright Chromium and real configured providers for their real-flow checks. `verify-adaptive-indexed.mjs` also includes clearly identified fixture-driven edge checks. Its default real-index assertion expects the existing approved Reddit test corpus to contain the carpet-cleaning record. Set `EXPECT_INDEX_HIT=false` only when testing an environment without that record, not to claim a retrieval hit. `EVIDENCE_DIR` must point to a fresh, unsealed directory. Do not overwrite pinned evidence.

`verify-adaptive-voice.mjs` uses existing synthetic audio fixtures, the actual transcription provider and actual profile API. A pass is not a human speech-accuracy or latency study. Production release and acceptance evidence lives under `.mozak/evidence/adaptive-indexed-flow/`.
