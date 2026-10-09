# Social Match Assistant

**An MCP server that lets AI agents find what fits in local community posts, plus a bilingual web demo.**

Agents can scrape authorised public sources, classify and index posts, then search them with hard constraints applied before any AI scoring. The first target is Zagreb, in Croatian and English.

## Use it with an agent

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
claude mcp add social-match -- "$PWD/.venv/bin/python" -m social_match.mcp_server
```

Any MCP client works. See [docs/mcp.md](docs/mcp.md) for a generic config. Then ask:

> Plan a scrape of r/zagreb with 20 rows and show me the cost. Do not run it.

The agent calls `scrape_source` in dry-run mode and reports the exact request and a cost estimate. Nothing is sent until you confirm.

## Tools

| Tool | What it does |
| --- | --- |
| `scrape_source` | Plan or run one bounded Mindcase scrape of a Facebook group or r/zagreb. **Dry run by default** |
| `classify_record` | Side (request or offer) and category. Offline rules, or OpenAI Decisions when you opt in |
| `index_records` | Validate and store posts in a local SQLite FTS5 index |
| `search_index` | Hard constraints first, then scoring. Returns suitable, uncertain and excluded |
| `draft_post` | Draft a post from facts you confirmed. Never publishes |

## Safe by default

- No spend without a key **and** `confirm_paid=true` on the call.
- Constraints (city, price, expiry, side, neighbourhood) run in SQL. AI only ranks the survivors.
- Unknown is never treated as a mismatch, and is reported.
- Scraped text is untrusted data. Contact details are masked and authors are dropped.

Details in [docs/safety.md](docs/safety.md).

## Try the demo without any keys

```bash
cd backend && .venv/bin/python -m pytest -q          # 40+ tests, no network
cd ../frontend && npm ci && npm run dev              # http://localhost:3000
```

The website is a landing page (`/`) and an interactive demo (`/app`) in Croatian and English. It uses synthetic fixture data. Synthetic records are labelled and live integrations are not connected.

## Layout

```text
backend/    social_match package: MCP server, scraper, scoring, index   (Python)
frontend/   Next.js web demo                                            (TypeScript)
shared/     Zagreb neighbourhood catalogue, community source directory
docs/       architecture, MCP tools, safety, sources, concept
.mozak/     project memory for MOZAK
```

## Status

Early. The MCP layer and its tests are in place. The Mindcase and Decisions request shapes follow public documentation and have **not** been verified against the live services, so run dry runs first. No licence has been chosen yet.

## Docs

[Concept](docs/concept.md) · [Architecture](docs/architecture.md) · [MCP tools](docs/mcp.md) · [Safety](docs/safety.md) · [Sources](docs/sources.md)

Working on this repo with an agent? Start with `mozak project context social-match-assistant`.
