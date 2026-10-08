# Reddit pilot implementation evidence

Observed 2026-10-08. Scope: backend-only implementation for r/zagreb and r/askcroatia, posts and explicitly selected qualifying-thread comments. No live collection, paid calls, public deployment or frontend integration performed.

## Verification

Coordinator ran `backend/.venv/bin/pytest -q backend/tests`: 125 passed, one existing Starlette/httpx deprecation warning. `git diff --check -- backend` passed. Tests exercise real FastAPI routes with mocked HTTP provider transport, not live Mindcase.

- Sources: allowlisted subreddits, required strict row cap 1..50 and freshness 1..90 days, provider POST payload with sortBy=new and no ineffective timeRange, per-row subreddit/URL checks.
- Filtering: stale/missing/invalid/future dates excluded (5-minute clock tolerance), city/kvart mention evidence, ambiguous names not automatically localized, Croatian inflections including eight owner neighbourhoods, unknown neighbourhood preserved. Text/location length bounds and duplicate handling.
- Comments: exact owner-supplied fields, parent postUrl/postId and optional subreddit checks, comment permalink matches commentId, rejected arbitrary/unqualified parents, eligible parents expire. Relevance is location/freshness qualification plus explicit caller selection, not semantic opportunity classification.
- Async: server-owned bounded job metadata, original filters/parent/caps reused, unknown or wrong-kind jobs rejected, terminal/unknown status stops polling, truncation and partial status disclosed. No automatic POST retries.
- Safety: no raw provider envelope returned, secret redaction before normalization, missing key fails closed, sanitized provider errors. In-memory registries only, no imported personal data persisted.

## Limitations

Live provider schema, access, billing and retrieval completeness remain unverified. Need owner-selected row counts, date window and live-run approval before collection. This is backend implementation, not an end-to-end live-data pilot. Both registries are process-local and bounded to 500 entries; restart or eviction loses context. Comments may carry unknown dates rather than implying freshness. Location is mention evidence, not verified geography. Existing Facebook endpoints remain unchanged. Frontend is owned by the separate sloth session.
