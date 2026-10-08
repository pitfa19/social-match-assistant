# Real HTTP acceptance follow-up

2026-10-08 12:38 UTC. Started the actual backend with its installed uvicorn executable, actual app.main:app, bound to 127.0.0.1:8013. No copied source, dependency overrides, mock transport, or synthetic provider responses in this check. Explicit empty MINDCASE_API_KEY disabled paid calls without reading stored credentials.

Observed over real loopback HTTP:
- GET /health: 200, status ok, mindcase_key_configured false.
- GET /openapi.json: published Reddit posts/comments and both async result routes.
- POST /pilot/reddit/posts, subreddit croatia: 422 with allowlist validation.
- Same route, max_results 51: 422 with maximum 50 validation.
- Same route, valid zagreb/10 rows/7 days: 503 not_configured, correctly stopped at provider boundary.
- POST /pilot/reddit/comments, unqualified parent: 409 parent_not_qualified.
- Both async result routes, unknown UUID: 409 unknown_job.

This real path exposed unsafe recovery wording suggesting repeating POST after context loss. Fixed guidance to inspect the existing Mindcase job before another billed run. Restarted service and observed corrected guidance over real HTTP. Full 125-test regression and diff whitespace check passed again.

Acceptance boundary: local HTTP boot, published API, validation and no-credential/unknown-context paths are observed, not just inspected. Successful provider retrieval, billing, candidate quality and comments from a live selected thread remain UNVERIFIED. Paid live collection is blocked by missing owner-selected live collection bounds/approval, not a technical credential failure (key was intentionally disabled). This does not close the full live-provider feedback loop or establish better discovery quality. No frontend integration was requested in this backend fork. Temporary verification process stopped after checks.
