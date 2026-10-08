# Mindcase integration proposal

Checked October 8, 2026. **Provider selected, integration not implemented or live-tested.**

The owner selected Mindcase. Its proposed role is Facebook/Reddit collection, inferred from the discussion and its documented extraction APIs. It does not replace ElevenLabs voice, Decisions relevance scoring or PostgreSQL storage. Those replacements were not requested. The working label Spona does not rename the registered project.

## Verified public contracts

These are documentation and public-schema observations, not successful collection runs.

| Agent | Public parameter-schema GET | Proposed authenticated job POST |
|---|---|---|
| Facebook posts | `https://api.mindcase.co/v1/data/facebook/posts` | `/v1/data/facebook/posts/run?wait=true` |
| Reddit posts | `https://api.mindcase.co/v1/data/reddit/posts` | `/v1/data/reddit/posts/run?wait=true` |

API origin is `https://api.mindcase.co`. The developer document declares legacy aliases, while examples use current `/v1/data` paths. Use the current paths, not a guessed concatenation of legacy prefixes. Job submissions use Bearer authentication and a JSON `params` object. Store credentials server-side only. No credential was requested, read or created during this check.

- Facebook schema: use one string `urls` for a public Page/profile, or one string `groupUrls` for a public group, not both. `maxResults` is an integer. Date filters are listed, but group input mode does not list them. Do not promise server-side date filtering for groups until tested.
- Reddit schema: at least one of string `urls` or `keyword`; the description says both together run together, not necessarily a keyword filter confined to that subreddit. `maxResults` is an integer. `sortBy` includes `new`, `top`, `hot`, `relevance`, `comments`. `timeRange` applies only to `top`. Apply local community and freshness checks before exposing results.
- Both public schemas list USD 0.005 per row. A proposed 20-row run is approximately USD 0.10, not an approved charge or guaranteed total. Pricing advertises a USD 19.99 initial top-up tier. Purchases and runs need separate approval.
- Set a positive row cap. Missing caps or zero mean unbounded collection. Public availability is not source permission.
- Do not send `maxComments` to Reddit posts: it is absent from the current parameter schema. The marketing page contradicts itself about comments. Treat posts as the scope and reject unexpected comment rows.

## Proposed ingestion lifecycle

1. **Authorise:** select an exact source URL and allowed purpose, record rights/terms review and organiser approval where required, approve a small budget and per-job cap. Keep the connector disabled otherwise. Do not submit user profiles or voice recordings as collection parameters.
2. **Collect:** the backend validates allowlisted source hosts, input modes and schema keys. Start one capped job. Keep job identity and status separate from source records. Prefer a short wait and reuse the returned job ID if collection continues.
3. **Complete safely:** poll `/v1/jobs/{job_id}/results` with bounded backoff/deadline. Stop on completed, failed, cancelled or rejected_balance. A timeout does not mean the underlying job stopped. Do not retry POST blindly after a lost response, which might create a second paid job. Stop on authentication/balance/input errors. Back off on rate limits and redact logs. Retrieve truncated inline data through the same job's results/download route, never a second POST. Verify counts and caps, quarantine unknown states or inconsistent responses, and disclose any incomplete output.
4. **Normalise:** validate required ID, canonical source URL and timestamps. Deduplicate by platform and source ID. Facebook maps `postId`, `postUrl`, `text`, `postedAt`; Reddit maps `redditId`, `redditUrl`, `title`, nullable `body`, `posted`. Drop author identities, avatars, comment text, media and contact details by default. Do not fetch returned links or media automatically.
5. **Match and explain:** check source permission, expiration, geography, budget and availability deterministically. Only eligible content reaches the proposed Decisions classifier/reranker. Store source provenance and freshness, not a fabricated match confidence. The user opens the original source or reviews a grounded draft; no automatic contacting or publishing.

This lifecycle is a design, not implemented code. Future integration ownership is `src/integrations/mindcase/`, shared record contracts remain root-owned, and backend orchestration stays in `src/backend/`. Existing UI and voice proposals are unchanged.

## Proposed minimal record

`sourceKind` (facebook/reddit/user/fixture), `sourceId`, `sourceUrl`, `sourceContainer`, `title`, `text`, `publishedAt`, `fetchedAt`, `expiresAt`, `permissionRef`, `jobId`, `status`, `contentHash`, `schemaVersion`.

Require permission provenance before retention or AI processing. Missing dates, deleted content, forbidden sources or schema errors quarantine a record instead of silently accepting it. Raw vendor payloads and user data are not repository fixtures. Synthetic fixtures are independently authored and visibly labelled.

Mindcase's DPA says job output is deleted after seven days and describes customer/controller and provider/processor roles. It does not settle EU hosting, subprocessors, transfer safeguards or our lawful basis. Our proposed retention/deletion system must remove records and derived indexes independently. No GDPR or platform compliance determination has been made.

## Acceptance checks before calling this integrated

| Check | Required observation | Current state |
|---|---|---|
| Exact API contract | Public schemas resolve and document input/output keys | Passed, GET only |
| Safe input and budget control | Unknown keys, private sources and unbounded limits rejected; spend stays capped | Designed, not run |
| Complete job lifecycle | Running/terminal/error/truncated/timeout paths handled without duplicate paid POSTs | Designed, not run |
| Content and source controls | Authorised live rows normalise, deduplicate and expire; unrelated/forbidden rows never surface | Blocked on permitted test source and implementation |
| User workflow | A Croatian profile finds a relevant permitted item with explanation and source link; a draft uses confirmed facts only | Not implemented or tested |

No paid run, account signup, top-up, live ingestion or application code was performed. Source permission, a capped test budget, safe credential provisioning and implementation approval remain gates. Never ask the owner to paste a key into chat or commit a key.

## Primary sources and limits

- Official public Facebook schema: `https://api.mindcase.co/v1/data/facebook/posts`
- Official public Reddit schema: `https://api.mindcase.co/v1/data/reddit/posts`
- Developer contract: `https://mindcase.co/skills.md` (general workflow and route table read; unrelated agent catalog was truncated)
- Endpoint descriptions: `https://mindcase.co/api/facebook/posts`, `https://mindcase.co/api/reddit/posts`
- Pricing: `https://mindcase.co/pricing`
- Terms, sections 4–6 and 9–10: `https://mindcase.co/terms`
- Data processing, sections 1–9: `https://mindcase.co/dpa`

These were built-in web/webfetch reads, not recorded MCP evidence. Public schema examples were inspected transiently, not retained as demo data. Technical reach, lawful collection, Croatian relevance and production reliability are separate questions. Mindcase's terms require source-platform compliance and disclaim platform endorsement, so buying collection access does not resolve the source-access gap.
