# Backend: `social_match`

Python package with the MCP server and its core library. See [docs/mcp.md](../docs/mcp.md) for the tool reference and [docs/architecture.md](../docs/architecture.md) for the design.

```bash
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest -q          # offline, mock transports only
.venv/bin/python -m social_match.mcp_server   # stdio MCP server
```

Environment (all optional, see `.env.example`): `MINDCASE_API_KEY`, `OPENAI_API_KEY`, `SOCIAL_MATCH_DB`.
Nothing is read from `.env` automatically. Export variables yourself.

`fixtures/synthetic_hr.json` holds 18 synthetic Croatian posts for demos and tests. `service.load_fixture(conn)` loads them into a `demo` corpus, labelled `synthetic`.
