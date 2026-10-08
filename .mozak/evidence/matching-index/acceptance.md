# Matching index and geography acceptance

Date: 2026-10-08. Scope: prepare a persistent matching index and bounded Decisions comparison, and expose official Zagreb areas. No new paid Decisions benchmark or Mindcase collection was run for this task.

## Coordinator-observed real acceptance

- Real FastAPI/uvicorn on loopback `127.0.0.1:8014`, actual isolated PostgreSQL 16 via private Unix socket port 55439. Existing system PostgreSQL 5432 was not changed.
- `GET /matching/neighbourhoods`: HTTP 200, 238 entries: 17 official districts, 218 official local committees, 3 colloquial aggregates. Availability is not community-source coverage.
- `POST /matching/benchmark/dry-run` with `max_api_calls:200`: HTTP 200. 18 synthetic posts and 15 labelled queries produced 177 eligible brute pairs and 46 indexed pairs (131 fewer, 74.01%). All 26 labelled relevant eligible pairs survived retrieval, with zero candidate truncations. `scoring_metrics:null`: no model quality, live latency or actual cost claim.
- `POST /matching/retrieve` for mathematics tuition against the fixture: HTTP 200, two candidates (mathematics tuition and English tutoring). This deliberately exposes lexical false positives for the Decisions reranker rather than claiming retrieval is final matching.
- `POST /matching/benchmark/live` with confirmation and cap 1: HTTP 409 `exceeds_max_api_calls`, planned177 exceeds cap1, before any provider request.
- PostgreSQL stop/start preserved all 18 fixture records. Actual indexes exist: GIN text search, corpus/kind/city, expiry and price. EXPLAIN on 18 rows chose a sequential scan, as expected for this tiny corpus. No large-scale index performance claim.
- Reused the already-approved completed Reddit job `97eb4dfa-673b-4826-87c3-bc7c24f4cc4d` through its existing-job GET route. No new collection POST. Ten actual rows imported through `/matching/records/import-reddit` into separate corpus `reddit-approved-probe`: first import inserted10, second unchanged10, invalid0.
- Actual `/matching/retrieve` query `čišćenje tepiha` (offering help, city Zagreb) returned one live indexed candidate: post `1x0oozi`, “Pranje tepiha u Zagrebu”. Unknown kind and expiry remain explicit. This is retrieval evidence, not a verified match or endorsement.
- Coordinator ran geography/resolver test files: 27/27 passed, including every catalogue entry through qualified aliases, legacy IDs/zoom, ambiguous names, negative/multiple names, capped hierarchy, and nonfinite model confidence.

## Review corrections requested

Corrections implemented and independently checked: initial plan reads use a REPEATABLE READ transaction on the public autocommit connection, then freeze queries/rows/candidate IDs before the call-cap check. Scoring and metrics reuse that snapshot. Failed relevant scores remain in end-to-end recall. Decisions parsing supports official probability records, weighted scores, finite confidence and typed refusals, without exposing provider text. Scoring inputs include bounded structured query/post constraints rather than assuming unknown posts are complementary.

- Coordinator reran the complete backend suite after corrections: **170 passed**, including real throwaway PostgreSQL tests, concurrent snapshot mutation, call-cap enforcement and malformed provider shapes. Provider scoring is mocked, not live. One existing Starlette/httpx deprecation warning remains.
- Restarted own uvicorn on final reviewed source and repeated real HTTP checks: dry-run200 with177/46; cap1 live409 before spending; actual imported Reddit carpet query200 with post1x0oozi.
- Scoped implementation commits: geography `5f2d14f`; matching backend `c0b441c`. Unrelated frontend changes preserved. `git diff --check` passed.
- Real production frontend API on3101: exact `Mjesni odbor Brezovica` returned `{"status":"selected","id":"mo-brezovica"}`. No paid model call is needed for exact aliases.
- Shared real browser acceptance by frontend coordinator whale, audited here by reading results and screenshot: three actual profile calls followed by typed `Mjesni odbor Brezovica`, with no API mocks on the successful path. Map selected `mo-brezovica`, zoom13.00, latitude45.7243, longitude15.9041. Screenshot visibly shows Brezovica and the approximate-area label. Evidence: `.mozak/evidence/continuous-voice/browser/safety-results.json` and `mo-brezovica-desktop.png`, exercised by `frontend/scripts/verify-continuous-safety.mjs`. Speech pronunciation of this MO was not successful, so this is explicitly typed-path geography acceptance, not a speech accuracy claim.

## Geographic provenance and limits

Official Grad Zagreb spatial datasets are dated 2025-02-03, retrieved 2026-10-08. The shared JSON includes source URLs, SHA-256, licence and transformation method. Counts match that published snapshot, not a claim that no boundary changes occurred later. It includes no officials' contact records. Legacy aliases and three colloquial groups are curated, not an exhaustive list of informal neighbourhood names. Map focus points are derived from polygons; rendered highlights remain approximate circles, not administrative boundaries.

## Remaining limitations

Small hand-labelled synthetic fixture is a smoke test, not production recall evidence. Croatian retrieval uses folded lexical prefixes and a limited synonym list, not full Croatian stemming or embeddings. No broad live Decisions benchmark has been run. Imported Reddit location mentions remain candidate provenance, not validated catalogue IDs. The local backend is unauthenticated and must remain loopback-only. Frontend search is not wired to this new index in this scope.
