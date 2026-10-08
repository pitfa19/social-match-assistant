# Backend acceptance, 2026-10-08

Scope: owner requested minimal FastAPI Mindcase public-group adapter, backend only, future group database deferred by owner.

Observed implementation commit: ae82823.
Root reran `backend/.venv/bin/pytest -q`: 46 passed in 0.32s, one upstream Starlette TestClient/httpx deprecation warning.
Tests exercise actual FastAPI endpoints with mocked Mindcase transport: strict URL and limits, date validation, exact /v1 provider paths, parameters, missing credentials, HTTP errors, timeout, terminal states, truncation, credential redaction and no POST retries.
Root localhost smoke test: GET /health returned status ok and key configured false; GET /docs HTTP200; OpenAPI listed health, POST group scrape, GET job results.
No real Mindcase calls, paid runs, database, AI ranking, frontend edits or production deployment performed.
Live provider correctness is not established. The supplied Mindcase catalog defines the client contract. Group visibility and collection authorisation remain operator responsibilities. Local service has no authentication and must stay bound to127.0.0.1.
