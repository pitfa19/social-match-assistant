# Demo acceptance follow-up: real provider and public API

Observed October 8, 2026, 16:08-16:09 UTC following the user's explicit request to close the real acceptance loop. This supplements the original immutable acceptance record and supersedes its limitation that profile extraction was tested only with a stub.

## Real end-user path

Command: `LIVE_PROFILE=1 CHROME_PATH=/home/pitfa/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome node scripts/verify-demo-offers.mjs`.

The real running localhost app received three typed answers through its normal form: Gradski treper; Zanima me glazba; Tražim nekoga tko će mi prošetat psa i popraviti cijev u stanu. The explicit final neighbourhood was Trešnjevka. There were **3 real profile-provider requests, 0 stubbed requests**. The normal matching endpoint called the existing local backend and reported `backendAvailable: true`.

Observed results were exactly the two requested separate demo cards: `demo-pipe-repair-tresnjevka` (Ivo) and `demo-dog-walking-tresnjevka` (Maja). Both retained explicit synthetic provenance, Trešnjevka, no external URL, and the visible invented-advertisement labels. Cards were visible at 1440, 375 and 320 px without horizontal overflow or browser runtime errors. No code fix was needed after this real-path check.

The original implementation input's 'no paid calls' wording described the initial no-provider verification boundary too broadly. This follow-up used the existing owner-authorized provider-backed workflow for the explicitly requested real acceptance check, bounded to three extraction requests. It did not activate a provider, introduce credentials, collect posts or deploy. Do not repeat the original record's no-provider-call statement as the current verification result.

## Actual public matching API boundary checks

`node scripts/verify-demo-api.mjs` made 11 HTTP requests to the running application's `/api/zagreb/matches`, not an imported implementation copy or mocked backend:

| Input | Observed result |
| --- | --- |
| Both needs with owner's ASCII Croatian phrasing | 200, both correct demo ids |
| Dog walking alone | 200, only Maja |
| Pipe repair alone | 200, only Ivo |
| Same needs in Maksimir | 200, no demo ids |
| Music interest alone | 200, no demo ids |
| Offering services rather than requesting them | 200, no demo ids |
| Negated request | 200, no demo ids |
| Empty profile | 200, no demo ids |
| Unknown area id | 400 |
| Client attempts to enable demo through payload | 400 |
| Cross-origin request | 403 |

Every successful request reported the real index available. The post-check TypeScript check and `git diff --check` passed. Earlier 114 unit tests remain the evidence for production/opt-in exclusion, result cap and original-record preservation.

## Boundaries

Acceptance is for the existing local development app, not a production deployment. A production package build was not required or run, because this demo is intentionally disabled outside development and no deploy was requested. Fixtures are curated examples with limited lexical matching, not proof of general service recommendation quality. No database writes, collection requests, live posts or real contacts were created. The owner can now perform their own manual trial with the full provider-backed path already observed working.
