# MCP tools

Server: `python -m social_match.mcp_server` (installed as `social-match-mcp`). Transport: stdio.

## Tools

### `scrape_source`
Plan or run one bounded Mindcase scrape.

| Argument | Meaning |
| --- | --- |
| `source` | `facebook` (target is a `https://facebook.com/groups/...` URL) or `reddit` (target is `zagreb` or `askcroatia`) |
| `target` | See above. Anything else is rejected |
| `max_results` | Integer 1 to 100 |
| `newer_than` | Optional `YYYY-MM-DD`, Facebook only |
| `dry_run` | **Default true.** Returns the exact request and a cost estimate, no network call |
| `confirm_paid` | Must be true for a live run |
| `index_results` | Store surviving rows in the index |

A live run needs `dry_run=false`, `confirm_paid=true` and `MINDCASE_API_KEY`. One POST, never retried. Rows are normalised: author data dropped, emails and phone numbers masked, off-source, duplicate and future-dated rows counted in `dropped`.

### `fetch_scrape_job`
Read an existing job by id. Never starts a paid run.

### `classify_record`
Side (`request` or `offer`) and category (`housing`, `gigs`, `borrow_trade`, `help`, `volunteering`). `provider="heuristic"` is offline Croatian rules. `provider="decisions"` is OpenAI Decisions and needs `OPENAI_API_KEY` plus `confirm_paid=true`.

### `index_records`
Validate and store up to 500 posts. Invalid records come back in `invalid`, never dropped silently. With `classify=true`, missing `kind` and `category` are filled by offline rules.

Record fields: `source` (`reddit`, `facebook`, `user`), `record_kind` (`synthetic`, `live_imported`, `user_contributed`), `external_id`, `title`, and optionally `kind`, `body`, `city`, `neighbourhood_id`, `price_eur`, `posted_at`, `expires_at`, `url`, `provenance`.

### `search_index`
`query`: `kind`, `text`, and optionally `city`, `neighbourhood_id`, `max_price_eur`, `require_neighbourhood_evidence`. Returns `suitable`, `uncertain` and `excluded` lists plus `eligible_after_hard_constraints`. With `require_neighbourhood_evidence`, only non-synthetic posts that name the area in their text (or carry it as a structured field) are returned.

### `draft_post`
Compose a request or offer from confirmed facts (`confirmed=true`). Lists `missing_fields` instead of inventing. Never posts.

## Resources

- `social-match://index/stats` counts by source, record kind, side and category.
- `social-match://sources` the community source directory. Registry only. Listing a source does not authorise scraping.

## Connect a client

```json
{
  "mcpServers": {
    "social-match": {
      "command": "python",
      "args": ["-m", "social_match.mcp_server"],
      "cwd": "/path/to/social-match-assistant/backend"
    }
  }
}
```

Claude Code: `claude mcp add social-match -- python -m social_match.mcp_server` from `backend/`.

## Example agent session

> Plan a scrape of r/zagreb with 20 rows. Show me the cost first.

The agent calls `scrape_source(source="reddit", target="zagreb", max_results=20)` and reports the dry run. Nothing is sent until you say so.

## Status

The Mindcase and Decisions request shapes follow public documentation and are **not verified against the live APIs**. Tests use mock transports and never touch the network. Use dry runs first.
