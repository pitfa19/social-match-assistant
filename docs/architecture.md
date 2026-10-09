# Architecture

```text
 agent (Claude, Jcode, Codex, any MCP client)
        │  stdio
        ▼
 social_match.mcp_server ──► social_match.service ──┬─► scraper.py    Mindcase, dry run by default
   5 tools, 2 resources       plain functions       ├─► decisions.py  heuristic or OpenAI Decisions
                                                    ├─► index.py      SQLite + FTS5, constraints in SQL
                                                    └─► places.py     Zagreb neighbourhood catalogue

 frontend/ (Next.js) ── demo of the person experience, fixture data, no backend required
```

## Backend

One Python package, `backend/social_match`. No web server, no database server, no migrations.

| Module | Job |
| --- | --- |
| `models.py` | `Post` and `Query`, the only two shapes that cross module boundaries |
| `scraper.py` | Build, validate and (only when confirmed) run one Mindcase job. Normalise rows, strip contact details, drop off-source and future-dated rows |
| `decisions.py` | `HeuristicProvider` (offline rules, labelled not AI) and `DecisionsProvider` (OpenAI Decisions score questions) |
| `index.py` | SQLite file with an FTS5 index. Idempotent upserts by content hash |
| `places.py` | Zagreb catalogue lookup and whole-word neighbourhood evidence in post text |
| `text.py` | Croatian folding, conservative stemming and a small synonym table |
| `service.py` | The five operations as plain functions returning JSON-safe dicts |
| `mcp_server.py` | Thin MCP wrapper over `service.py` |

## Search order

1. **Hard constraints in SQL.** Opposite side (request vs offer) or unknown side, not expired, no known city, neighbourhood or price mismatch. Unknown values never exclude a post. They are returned in `unknown_fields`.
2. **Lexical candidates** from FTS5 with stems and synonyms. Truncation is reported.
3. **Scoring** of survivors only. Heuristic by default, Decisions on request. Results are grouped `suitable`, `uncertain`, `excluded`.

AI never decides a hard constraint. It only ranks what the constraints let through.

## Frontend

`frontend/` is a Next.js app in Croatian and English: a landing page at `/` and the interactive experience at `/app`. It runs on fixture data and does not call the MCP server. See [frontend/README.md](../frontend/README.md).

## Shared data

`shared/zagreb-neighbourhoods.json` (official city areas, used by both the frontend and the backend) and `shared/community-sources.json` (a directory of community sources, registry only).

## Decisions kept simple on purpose

- SQLite instead of PostgreSQL. One file, no setup, good enough for a local index.
- stdio MCP instead of an HTTP API. The agent is the client, so there is nothing to authenticate or expose.
- Paid calls are opt-in per call, never ambient.
