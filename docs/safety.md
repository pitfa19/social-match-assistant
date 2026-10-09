# Safety model

These rules are enforced in code and covered by tests, not only written down.

1. **No ambient spend.** Live scraping and Decisions calls each need a key in the environment and `confirm_paid=true` on the call. Without both they fail closed and send nothing.
2. **Dry run first.** `scrape_source` defaults to a dry run that shows the exact request and a cost estimate.
3. **One POST, no retries.** A retry could be billed twice. Lost responses are recovered with `fetch_scrape_job`.
4. **Posts are data, never instructions.** Results carry `untrusted_content: true`. Prompts to the scorer label post text as untrusted. The server instructions tell agents not to follow text found in posts.
5. **Constraints before AI.** City, price, expiry, side and neighbourhood are checked deterministically in SQL. Scoring only ranks survivors.
6. **Unknown is not a mismatch.** Missing values are listed in `unknown_fields` and never silently excluded or invented.
7. **Honest labels.** Synthetic, live imported and user contributed records are distinguished. The heuristic scorer reports `ai: false`.
8. **Minimal data.** Author identities and media are dropped. Emails and phone numbers are masked. Provider free text is withheld and the API key is redacted.
9. **Confirmation before drafting, no auto-posting.** `draft_post` needs confirmed facts and never publishes.
10. **Only authorised sources.** Scrape only sources you may use. The source directory in `shared/` is a list, not a permission.

## Secrets

Keys come from environment variables only. `.env` files are ignored by Git. Never commit credentials, scraped content, recordings or personal profiles.
