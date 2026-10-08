# Adaptive onboarding and indexed opportunities acceptance

Observed 2026-10-08. Owner request: skip questions already answered anywhere in a response and connect the existing indexed backend efficiently. Work was completed solo. No new collection, production record import, paid relevance benchmark, backend deployment or infrastructure change was performed.

## Delivered revision

- Application source: `57344e28bb3226337bb962c33e84f82dafebb1ef`.
- Immutable git archive deployed to the existing Railway frontend.
- Deployment: `4d901b37-b5f0-4af6-8344-a50346bef90e`, observed `SUCCESS`.
- URL: https://kvartnakvadrat.up.railway.app
- Existing private backend credentials, preview expiry and fallback access settings preserved. The pre-existing public preview expiry is 2026-10-08T22:00:00Z, not an automatic service shutdown.
- Later additions are a partial-flow verification script, runtime documentation and these evidence records, not application changes.

## Requirement-to-observation map

### Adaptive answers

- `browser/results.json`: 30 checks on the production-mode local application. The real provider processed one answer containing description, interest, offer and Maksimir, skipped directly to the map and made one profile request with no separate neighbourhood request.
- `public/results.json`: 29 checks on the deployed application, including the real one-answer flow. The difference from the local count is the explicitly omitted positive-record assertion, not a failed check hidden as a pass.
- `public-partial/results.json`: 9 real public checks. A first answer containing occupation, offer and area left only the interests question. Answering it completed onboarding using the remembered area. Two profile requests, zero neighbourhood requests. No index request before profile completion.
- Real semantic safety checks in local and public results retained a negated preference and did not adopt a brother's location or infer an offer. Unit cases separately cover unsupported/ambiguous places, quoted grounding, empty coverage, stale transactions and deleted facts.
- `public-voice/results.json`: one microphone start, one automatically committed whole-answer profile extraction, skipped covered prompts, selected Maksimir and completed indexed search. Microphone tracks ended. Actual transcription and extraction providers were used with synthetic test audio. Local voice evidence is also retained.

### Indexed backend and efficiency

- `browser/results.json`, `real-index.json`: actual frontend proxy -> local FastAPI -> existing PostgreSQL corpus `reddit-approved-probe` -> imported Reddit record 37, "Pranje tepiha u Zagrebu". It is displayed as a lexical candidate with unconfirmed neighbourhood and availability, not a confirmed match.
- `public/results.json`, `public-partial/results.json`, `public-voice/results.json`: deployed frontend -> existing private Railway backend succeeds with `indexAvailable: true`, `sourcesAvailable: true`, HTTP 200. The tested production queries returned zero candidate posts and 12 source-directory links. This is a truthful empty search, not evidence that no opportunities exist or proof that every production corpus is empty. No local posts were copied into production.
- `public-health/live-checks.json`: 8 checks pass, including public page/health, persistent registry of 21 sources, neighbourhood source filters, cross-origin denial and no public import bridge.
- At most two bounded indexed retrieval requests and one source-directory read in parallel. Maximum 12 candidates per retrieval and 12 unique displayed results. Request/offer facts take priority over broad biography. No new collection or paid relevance scoring call.
- Client debounce is 250 ms. Superseded requests are aborted and response keys prevent stale state. Successful response cache is component-local, max 8 entries, TTL 30 seconds. Camera-only changes and unsubmitted typing do not search.
- Actual public search-control acceptance proves city-wide selection, explicit custom offer refinement and cache reuse when restoring profile facts. Controlled browser responses verify stale races, deleted-note refresh, backend failure, retry and truthful empty states. The controlled edge checks are not misrepresented as real backend failures.
- Server-only corpus configuration defaults to `main`. Browser input cannot select corpus, backend URL, mode or limits. Cross-origin and malformed/injected requests are rejected. Synthetic benchmark content and unsafe URLs are filtered.

### Design and regression

- `unit-tests.txt`: 98 tests pass. `typecheck.txt`: exit 0. `build.txt`: production build passes.
- `design/results.json`: 37 existing design checks pass against final application code.
- Local and deployed browser checks fit 320, 390, 768 and 1440 widths without horizontal overflow. Real mobile screenshot was visually reviewed. Mobile hierarchy is map, editable notes, opportunities. The source directory starts collapsed and its opened content distinguishes unverified links from collected posts.
- Existing one-colour, full-page design and SVG map are retained. Notes remain hidden until there is something to show. Reduced-motion behavior and microphone pause behavior remain intact.

## Iteration record and limitations

- A missing required `retention` field in the newly authored planning input was repaired after MOZAK identified it. The original owner scope was unchanged. Context returned ready afterward.
- One regression command referenced the wrong harness filename. The correct `verify-site-design.mjs` then passed all 37 checks.
- `partial/failure.json` records a verification race: the test inspected the preceding settled response immediately after clicking custom search. The harness was corrected to await that exact network response. The real public partial/control flow then passed all 9 checks. No application change was needed.
- Performance claims are bounded-request and request-count observations, not a comparative latency, load or human usability benchmark.
- Selection filters exact backend neighbourhood ids. District-to-local-committee expansion and distance ranking are not implemented. City-wide search is explicit opt-in. Unknown-area records are labelled under the backend's existing eligibility rules.
- Source links are a separate directory. Facebook links remain unverified and no Facebook posts were collected.
- Provider speech/semantic recognition remains probabilistic. The synthetic whole-answer voice test does not establish accuracy for all users or a full multi-turn speech benchmark.

All original contract requirements have current evidence. The deployed no-result state is a data-availability limitation for the tested queries, not an unfinished backend connection. Evidence files are sealed by `artifact-manifest.sha256` and the successor plan. Do not overwrite them.
