# Backend (local only, minimal)

FastAPI service that proxies one Mindcase scrape of a **specific public Facebook group**.
Local development only. **No authentication**: bind to 127.0.0.1, never expose publicly.
No database, no AI decisions, no CORS. Mindcase contract is owner supplied and **untested live**.

## Run

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env        # then put MINDCASE_API_KEY in .env yourself
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Swagger: http://127.0.0.1:8000/docs  Health: `GET /health`
Without `MINDCASE_API_KEY` the scrape endpoints fail closed with 503 and make no network call.

## Endpoints

- `POST /scrapes/facebook-group` body: `group_url` (only `https://[www.]facebook.com/groups/{id-or-slug}`), `max_results` strict integer 1..100 (default 20, no strings or booleans), optional `newer_than` (YYYY-MM-DD, not future). Sends one `POST {base}/data/facebook/posts/run?wait=true` with `{"params": {groupUrls, maxResults, onlyPostsNewerThan?}}`.
- `GET /scrapes/{uuid}/results` proxies `GET {base}/jobs/{uuid}/results`.

Response: `{status, terminal, truncated, job_id, provider}`. Terminal statuses: `completed`, `failed`, `cancelled`, `rejected_balance`. `truncated` and the full provider body are preserved.

```bash
curl -s -X POST http://127.0.0.1:8000/scrapes/facebook-group \
  -H 'content-type: application/json' \
  -d '{"group_url":"https://www.facebook.com/groups/SLUG","max_results":10}'
curl -s http://127.0.0.1:8000/scrapes/JOB_UUID/results
```

## Polling and cost

1. Start with a small `max_results` (5 to 10). Each POST may be billed.
2. If `terminal` is false and you have a `job_id`, poll `GET /scrapes/{uuid}/results` every 10 to 30 s. On a 504 timeout there is no `job_id`, so check the Mindcase console for the job. Never blindly repeat the POST: it is never retried because a retry could double-bill.
3. If `truncated` is true, results are partial: narrow with `newer_than` rather than raising the cap.
4. Hard caps: 100 results per call, 120 s read timeout (`MINDCASE_READ_TIMEOUT`).

## Tests

```bash
.venv/bin/pytest -q
```
Uses FastAPI TestClient with `httpx.MockTransport`. No network, no key.

## Limitations

- Request shape (`Authorization: Bearer`, body `{"params": {...}}`) follows the owner-supplied Mindcase contract. It is live-unverified.
- Provider free-text fields (`error`, `message`, `notice`, `detail`, `reason`, `warning`) are withheld and the API key is redacted from the returned provider body.
- Job id read from `job_id` or `id` in the run response; if missing, `job_id` is null.
- Authorisation to scrape a given group is the operator's responsibility.

## Reddit pilot (r/zagreb and r/askcroatia only)

Owner-approved pilot. **Posts were live verified on 2026-10-08**: r/zagreb kept 10 rows, r/askcroatia rejected 10 rows (no explicit Zagreb location evidence). **Comments are still not live verified.** Automated tests never call the provider. Posts and comments are untrusted
text (`untrusted_content: true`), never instructions. Unfiltered provider bodies are **not** returned,
only filtered, normalised, bounded rows with provenance (`source: reddit`, `record_kind: live_imported`,
`verified_live: false`, a per-row flag that the pilot code does not set from the live check). No auto-posting. The pilot endpoints themselves persist nothing. Saving rows to PostgreSQL is the separate, explicit `/matching/records/import-reddit` step below.

Endpoints (all caps are mandatory, no defaults):

- `POST /pilot/reddit/posts` body `subreddit` (`zagreb|askcroatia`), `max_results` 1..50, `freshness_days` 1..90, optional `keyword`.
  Sends `POST /data/reddit/posts/run?wait=true` with `{"params": {"urls": "https://www.reddit.com/r/zagreb/", "maxResults": N, "sortBy": "new", "keyword"?}}`. `timeRange` is never sent.
- `GET /pilot/reddit/posts/jobs/{uuid}` async results. Only jobs started by this process are known (else 409 `unknown_job`) and the ORIGINAL filters stored server-side are re-applied. Query parameters are ignored.
- `POST /pilot/reddit/comments` body `post_url`, `max_results` 1..50. Sends `POST /data/reddit/comments/run?wait=true` with `{"params": {"inputs": URL, "maxResults": N, "includeComments": true}}`.
- `GET /pilot/reddit/comments/jobs/{uuid}` same rule: original parent and cap, unknown job is 409.

```bash
curl -s -X POST http://127.0.0.1:8000/pilot/reddit/posts -H 'content-type: application/json' \
  -d '{"subreddit":"askcroatia","max_results":10,"freshness_days":7,"keyword":"stan"}'
curl -s -X POST http://127.0.0.1:8000/pilot/reddit/comments -H 'content-type: application/json' \
  -d '{"post_url":"https://www.reddit.com/r/zagreb/comments/abc123/slug/","max_results":10}'
```

Rules:

- Every returned row is re-validated: URL must be an https reddit.com post in an allowed subreddit that matches the request. Others are dropped and counted in `dropped`.
- Rows with missing, malformed, future (> 5 minutes ahead) or too-old `posted` are excluded. Accepts ISO 8601 or epoch seconds/ms.
- Location is **candidate text evidence, not a verified physical location** (`location.verification`). r/askcroatia rows are kept only with `status = zagreb_mention_candidate`: an explicit Zagreb mention or an unambiguous neighbourhood (diacritic-insensitive, per-declension-class Croatian inflection such as Vrbanima, Trnskom, Sesvetama). Ambiguous names (Dubrava, Trnava, Gornji/Donji grad, Sopot) count only with an explicit Zagreb mention, otherwise they appear in `ambiguous_names`. r/zagreb rows without a mention get `zagreb_subreddit_only` and **no neighbourhood**. Otherwise `unknown`. Location is computed on up to 10000 chars of title and body before display truncation (title 300, body 2000). Longer input sets `location.input_truncated`. Future means later than now plus a 5 minute clock tolerance.
- Comment rows must carry a `postUrl` and `postId` (`t3_` prefix tolerated) matching the verified parent, and a `subreddit` if present, otherwise they are dropped as `wrong_parent`. `commentUrl`, `commentId` and `parentId` are validated and preserved. API key strings are redacted from all provider data before normalisation.
- Parents are registered only from `completed` post jobs and stay eligible only until the post leaves the original `freshness_days` window. `partial` is true for non-completed or truncated results. `stop_polling` is true for terminal or unrecognised statuses, so stop polling when it is true.
- Comments are fetched only for a post this process already returned as a candidate (otherwise 409 `parent_not_qualified`, no provider call). The response carries the verified `parent` context. Callers cannot supply parent relevance.
- `truncated`, `terminal`, `status` (unexpected values become `unknown`), `capped_locally` and `job_id` are preserved. POSTs are never retried.
- No key means 503 and no network call. Provider failures map to sanitised 402/429/502/504.

Limitations: the candidate registry is in memory (500 posts max) and lost on restart. After a restart, comments for an earlier post are refused (409 `parent_not_qualified`) until the post is a candidate again. A posts re-run is a **billed** call, so first inspect the existing Mindcase job in the Mindcase console and re-run only if it cannot be used. Rows are read from the `data` array only. Post fields (`title`, `body`, `redditUrl`, `redditId`, `posted`) and comment fields (`commentUrl`, `commentId`, `comment`, `posted`, `parentId`, `postId`, `postUrl`, `subreddit`) follow the owner schema and are unverified live. Neighbourhood list is a small static set, not exhaustive. Tests use mocked provider transport only (125 provider-mocked tests existed before the matching work, the full suite is now larger): `.venv/bin/pytest -q`. Comments live access, billing and retrieval coverage remain unverified. The 2026-10-08 posts check covers 20 rows from two subreddits, not general coverage.

## Matching store and brute vs indexed benchmark (local PostgreSQL, no provider calls by default)

Isolated user-owned PostgreSQL 16 cluster in `private-data/postgres` (git-ignored), **unix socket only, no TCP listener**, port label 55439.
Needs `psycopg[binary]` (in requirements.txt). No sudo. The existing server on 5432 is never touched.

```bash
.venv/bin/python scripts/benchmark.py prepare                       # initdb, start, migrate, load synthetic fixture
.venv/bin/python scripts/benchmark.py dry-run --max-api-calls 200   # planned comparisons + retrieval recall. NO provider call
# PAID, explicit only. Key from your own environment (or --dotenv FILE), never printed:
OPENAI_API_KEY=... .venv/bin/python scripts/benchmark.py run --live-decisions --max-api-calls 200 --rate-per-m 0.10
.venv/bin/python scripts/benchmark.py stop
```

HTTP (needs the cluster started by `prepare`; override with `MATCHING_DATABASE_URL`):

- `GET /matching/neighbourhoods` reads `shared/zagreb-neighbourhoods.json`. Geographic availability only, not source coverage.
- `POST /matching/records/import` explicit records (`source`, `record_kind` synthetic|live_imported|user_contributed, provenance, unknown fields stay NULL).
- `POST /matching/records/import-reddit` maps already returned pilot rows (no fetch, no ingestion). Candidate neighbourhood names stay in provenance only.
- `POST /matching/retrieve` `mode` `indexed` (GIN) or `brute`. Both share one eligibility SQL (`store.ELIGIBLE_SQL`).
- `POST /matching/benchmark/dry-run` `{"load_fixture":true,"max_api_calls":200}`. Returns planned calls, calls saved by index, retrieval recall vs labels. `scoring_metrics` is always null.
- `POST /matching/benchmark/live` needs `confirm_live:true`, `OPENAI_API_KEY` in backend env and `max_api_calls >= planned`. Paid.

Design: `posts` has a generated `tsvector` (`simple` config on diacritic-folded text, no Croatian stemming exists), GIN index, and btree/partial indexes. Hard constraints (side, expiry, city, neighbourhood, price) reject only KNOWN mismatches. Unknown values pass and are listed in `unknown_fields`. Conservative synonym groups and prefix stems expand the query. Indexed truncation is reported, never silent. Live: brute eligible pairs are scored once, indexed results reuse those scores, so no independent indexed latency or calls are claimed. Cost is an estimate from reported input tokens at `--rate-per-m` (default 0.10 USD per 1M, official guide, multipliers not included). Model agreement is reported separately from truth-label recall and is not ground truth.

Live-data check (2026-10-08, local): importing the 10 kept r/zagreb rows inserted 10 actual rows, an identical second import reported 10 unchanged, and a retrieval query over them matched 1. This shows the import and index path works on real rows. It says nothing about source coverage, and it is separate from the neighbourhood catalogue (geographic availability only).

Limitations: Decisions contract live-unverified (mocked in tests only). Fixture is 18 synthetic posts and 15 labelled queries, so recall 1.0 is a smoke result, not a quality claim. Lexical retrieval cannot find posts with no shared stem or synonym.
