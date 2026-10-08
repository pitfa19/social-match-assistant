# Deployment secrets and public source

## Configure Railway, not Git

Keep all provider credentials in private Railway service variables. This repository contains variable names and blank examples only. Never use `NEXT_PUBLIC_` for a credential or add secret values to `next.config.ts`.

| Service | Private variables |
| --- | --- |
| Frontend | `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `BACKEND_ACCESS_TOKEN`, `SITE_ACCESS_PASSWORD` |
| Backend | `MINDCASE_API_KEY`, `OPENAI_API_KEY`, `BACKEND_ACCESS_TOKEN`, `DATABASE_URL` |

`BACKEND_ACCESS_TOKEN` must agree between the two services. The backend and database stay on Railway's private network. Keep `APP_REQUIRE_AUTH=true` in production and preserve the owner's explicit public-preview deadline.

For local development, copy the appropriate `.env.example` to an ignored local env file and supply your own credentials. Existing local `.env` files are private developer state, are excluded by Git and the deployment upload rules, and must not be force-added. Do not commit source imports, private-data, recordings, uploads, dependency trees or generated application bundles.

## Before publishing or pushing

1. Run Gitleaks against all refs: `gitleaks git . --log-opts="--all --full-history" --redact=100`.
2. Check `git ls-files` for accidentally tracked env files, credentials, private data or recordings. Blank `.env.example` files are permitted.
3. Review screenshots and historical evidence for personal data. A clean credential scan cannot establish that images are safe to publish.
4. Confirm the deployed provider-backed workflow still works and no secret appears in browser-delivered JavaScript or responses.

The `.gitleaksignore` file identifies only two exact historical findings for a deliberately fake credential passed to `httpx.MockTransport` in backend tests. It does not ignore entire paths, all generic API-key findings or real credentials. The publication audit used Gitleaks 8.30.1 with redacted output and independently compared actual configured secrets against repository objects and public static assets in memory, without writing their values to reports.

If a real credential is ever committed, keep the repository private, revoke or rotate that credential with its provider, update deployment configuration and clean all affected history before publication. Deleting it only from the current file is not sufficient. Never print secrets into logs or issue comments while investigating.
