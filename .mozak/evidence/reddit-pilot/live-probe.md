# Approved live Reddit probe

Owner approved live probe at 2026-10-08T12:42:42Z following explicit proposal: max 10 posts per subreddit, 7-day filter, no comments or automatic POST retries. Actual backend uvicorn on 127.0.0.1:8013 used existing server-side Mindcase credential, never printed. No mocked transport.

Observed 2026-10-08T12:43:32Z to 12:44:17Z:

| Source | Job | HTTP/status | Provider rows | Kept | Excluded |
|---|---|---|---|---|---|
| r/zagreb | 97eb4dfa-673b-4826-87c3-bc7c24f4cc4d | 200/completed | 10 | 10 | 0 |
| r/askcroatia | 1a89cafa-79df-4b8f-96ea-00986a1bf5de | 200/completed | 10 | 0 | 10 without explicit Zagreb evidence |

Both responses were untruncated, terminal, with no malformed/date/duplicate drops. Both GET /pilot/reddit/posts/jobs/{id} paths returned the same counts and original filters. Exactly two collection POSTs, then two existing-job GETs. No comments fetched or retries. Supplied catalog estimate for 20 records is $0.10; actual wallet debit not measured.

Qualitative spot-check of five r/zagreb candidate titles: one request for carpet-cleaning information plus transport, cycling enforcement and gas-billing discussion. This proves retrieval and filtering, not opportunity relevance: a location-qualified candidate is not automatically a useful match. The sampled candidates lacked confirmed neighbourhoods, correctly left unspecified. No full post bodies, author details or recordings retained in this evidence.

Result: live post ingestion and existing-job retrieval verified for both allowlisted sources. The small newest-post sample produced no qualifying r/askcroatia results, not evidence that the subreddit has no useful content. Future improvement could test targeted Zagreb/need queries before broad feed collection. Live comments, ranking quality and exhaustive neighbourhood coverage remain untested and outside this no-comments probe. Existing implementation evidence is historical and its live-unverified limitation is superseded only for the paths exercised here.
