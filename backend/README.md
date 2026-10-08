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
