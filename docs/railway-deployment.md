# Railway deployment and community source base

The owner authorized the source registry and whole-repository Railway deployment on 2026-10-08 at 13:40 UTC. At 13:52 UTC they requested a public, no-login testing site for today. The frontend is therefore public until **2026-10-08T22:00:00Z (midnight Europe/Zagreb)**, after which the preview access gate applies. Backend and PostgreSQL have no public domain or TCP proxy.

## Source registry

- Durable source-of-truth seed: `shared/community-sources.json`.
- PostgreSQL table: `community_sources`, seeded idempotently without overwriting later manual corrections.
- 19 Facebook group names, 16 supplied share links, 3 explicitly missing links. Nine entries are neighbourhood groups. Ten are general/topic groups.
- Two general Reddit sources: r/zagreb and r/askcroatia. They are not assigned to a kvart.
- Name-to-share-link pairing follows the owner's supplied order, but was **not independently verified**. These entries remain `ordered_unverified`, have no fabricated canonical `/groups/` ID, and are not ready for automatic collection.
- A configured source is not an imported post. Existing imported Reddit posts remain separate from the registry. No new scraping runs are performed by seeding or deployment.
- Lookup: backend `GET /matching/sources?area=Malešnica&include_general=false`; frontend `GET /api/sources` is a read-only server-side bridge. Croatian diacritics/case and exact aliases are normalized. Multiple Sesvete groups remain separate.

## Deployment topology

Project `4fc7dda5-675a-4f55-b2d3-f5eae9eb5f95`, production environment `41eb4b92-3b03-48ef-8dcd-8310cd5abdf1`.

- **frontend**: root build context with `frontend/Dockerfile`, Node 24 / Next.js. Public HTTPS domain. Health `/api/health`. Server-only provider credentials. Same-origin checks, existing per-IP route limits and additional single-replica public-demo limits (60 requests/minute, 300/hour). These counters reset on restart and are not a billing cap.
- **backend**: root build context with `backend/Dockerfile`, Python 3.12 / FastAPI on port 8000, private Railway networking only. All routes except health/readiness require a shared bearer token in deployment. Startup runs additive migrations and source-directory seed. Health `/ready` checks PostgreSQL.
- **Postgres**: Railway managed PostgreSQL template with durable volume, private connection referenced by backend. Local private-data folders and recordings are never part of the upload.

`deployment/configure_railway.py` uses the existing CLI login and scoped stdin variable setting, printing variable names only. Preview fallback credentials and backend token are generated once in root `.env.railway` (mode 0600, gitignored). It never reads Railway credential files. API keys are loaded from existing gitignored local files and transmitted only to their intended server-side Railway service.

Railway's current API rejects deprecated `railway.json` config files. The script configures supported service-instance fields directly, including Dockerfile path and health checks. Do not reintroduce the unsupported `DOCKERFILE` builder enum: specifying a Dockerfile path is sufficient.

## Deploy and verify

Run from repo root with an already authenticated Railway CLI:

```sh
backend/.venv/bin/python deployment/configure_railway.py
railway up --service backend --detach
railway up --service frontend --detach
railway deployment list --service backend --json
railway deployment list --service frontend --json
```

Deploy a tested, coherent snapshot. Do not upload a changing working tree while another session is midway through the map redesign. Never use `--no-gitignore`. `.dockerignore` and `.railwayignore` exclude env files, recordings, private source content, local databases, dependencies and build artifacts.

Verify public frontend HTTP 200, health 200, source bridge counts/aliases, typed geography route, and private backend denial without its token. No import or paid collection endpoint is exposed through the frontend bridge. Verify full voice/profile calls separately before claiming live AI acceptance.

## Hosted example offers (owner-authorized October 8, 2026, 16:16 UTC)

The current frontend supports three fictional Trešnjevka examples: pipe repair, dog walking and microphone rental. `HOSTED_DEMO_OFFERS=1` is an explicit **server-only** opt-in for the production runtime. It is disabled by default; `LOCAL_DEMO_OFFERS=1` alone still cannot enable it in production. The owner requested clean advertisement text without visible demo tags. Their internal source and synthetic provenance remain intact.

The overlay is in memory and never imports examples into the real PostgreSQL corpus. Keep the existing private backend connection, credentials and public-preview expiry unchanged. Set `HOSTED_DEMO_OFFERS=0` and redeploy the frontend to disable these examples. Ordinary real-result filtering still excludes synthetic database rows. Deploy the strict-neighbourhood-compatible backend before the updated frontend.

Public acceptance: run `APP_URL=https://kvartnakvadrat.up.railway.app node scripts/verify-demo-api.mjs` from `frontend/`. To explicitly run three provider-backed extraction requests as part of a full browser check, add `LIVE_PROFILE=1 WITH_MICROPHONE=1 APP_URL=https://kvartnakvadrat.up.railway.app` when running `scripts/verify-demo-offers.mjs` with an installed Chromium binary. The default browser check stubs extraction and must not be reported as provider acceptance.
