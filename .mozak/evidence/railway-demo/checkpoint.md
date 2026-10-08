# Railway demo deployment checkpoint

Owner authorization: 2026-10-08T16:16:36.576Z, deploy the current changes to Railway, including the three example offers. Existing project 4fc7dda5-675a-4f55-b2d3-f5eae9eb5f95, environment production / 41eb4b92-3b03-48ef-8dcd-8310cd5abdf1. Public frontend domain kvartnakvadrat.up.railway.app.

## Baseline observed before mutation

- Frontend service 1ae73515-24a7-4b48-adfb-48bbd48fd6bb: successful deployment 6797481c-5e5e-43ca-973e-f317b48718b0, image sha256:d6392183ba013589cc71f614aa4910f349e46791d9e80c839e27fc547fbf9d60.
- Backend service 6ab02f98-e3e0-4b82-82bb-0edfe6f76a87: successful deployment 0ab5622b-987d-41fd-88f8-06057f4c2ab4, image sha256:b57d8a2bf597dca5fd8ae53ddf259d409d9e5fa53682d1b38ee54afdd2f515eb.
- PostgreSQL untouched. Read-only remote SQL observed 121 main/live_imported rows, ordered aggregate content_hash MD5 dfccef5475b33d8bd0ed7d6089231ee4. Applied migrations 001_matching.sql and 002_community_sources.sql. Registry count 21.
- Frontend APP_REQUIRE_AUTH=true, BACKEND_URL=http://backend.railway.internal:8000, PUBLIC_PREVIEW_UNTIL=2026-10-08T22:00:00Z. No hosted-demo flag previously set. Existing secrets are not modified or recorded.
- Backend and Postgres have no public domains. Frontend provider variables are already configured. No configuration/credential regeneration script will run.

## Release candidate

Committed source 2839e0a. Immutable git archive prepared outside the working tree, excluding unrelated uncommitted edits and local secret files. 116 frontend tests passed in both current checkout and archived snapshot. Production Next.js build and TypeScript checks passed from the snapshot. The user's currently running local dev server was not stopped or rebuilt in place.

New server-only flag HOSTED_DEMO_OFFERS=1 explicitly enables the three synthetic offers in the production runtime; ordinary production remains off by default and LOCAL_DEMO_OFFERS alone cannot enable it. No synthetic records are inserted into PostgreSQL. Existing source and record metadata remains intact.

Backend must deploy before frontend because strict neighbourhood evidence was added since its existing deployment. No new migration files exist, and the source seed uses ON CONFLICT DO NOTHING. The old deployment IDs and images above are the rollback reference. Do not change the preview deadline, credentials, database service, public domains or collection state.
