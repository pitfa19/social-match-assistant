# Sources and the Mindcase scraper

The scraper wraps [Mindcase](https://mindcase.co) data agents for public Facebook groups and two subreddits. The request shapes below come from Mindcase's public schemas and are **not verified live**.

| Source | Endpoint | Key parameters |
| --- | --- | --- |
| Facebook group posts | `POST /v1/data/facebook/posts/run?wait=true` | `groupUrls` (one group URL), `maxResults`, optional `onlyPostsNewerThan` |
| Reddit posts | `POST /v1/data/reddit/posts/run?wait=true` | `urls` (subreddit URL), `maxResults`, `sortBy` |
| Job results | `GET /v1/jobs/{job_id}/results` | none |

Auth is `Authorization: Bearer $MINDCASE_API_KEY`, body `{"params": {...}}`.

## Cost

The public schema lists about USD 0.005 per row. A 20-row run is about USD 0.10. `scrape_source` prints this estimate on every dry run. Always set a row cap. A missing cap can mean unbounded collection.

## Normalisation

Rows are untrusted. Each row is checked for a valid HTTPS URL on the expected host, a stable id, text and a parseable, non-future date. Rows from another group or subreddit are dropped. Duplicates collapse by id. Author fields are never kept, emails and phone numbers are masked, and the result is a `Post` with provenance (`provider`, `job_id`, `verified_live: false`).

## Source directory

`shared/community-sources.json` lists community sources by neighbourhood. It is a registry. Entries marked `ordered_unverified` have not had their links or collection permission checked. Public availability is not permission, so review each source's terms before scraping.

## Data protection

Mindcase states that job output is deleted after seven days. That does not settle hosting location, transfer safeguards or your lawful basis. Delete records and derived index rows independently when you stop using them. No legal compliance determination has been made here.
