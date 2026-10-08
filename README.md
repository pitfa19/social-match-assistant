# Social Match Assistant

Private, setup-only repository for a Croatia-first match-and-post assistant.

**Status:** private repository created and pushed, local MOZAK onboarding validated, and project registered as `social-match-assistant`. No application, live integrations, deployment or provider activation exists yet.

Fresh-agent entry point: `mozak project context social-match-assistant`. Setup completion evidence is in `.mozak/evidence/repo-onboarding-2026-10-08/checkpoint-v2.json`.

## Product

Two editable profiles: **you/current goal** and **an item/request/offer**. Two actions: **find what fits** and **help me publish**. General local requests include rentals, gigs, borrowing, practical help and volunteering.

Intended data sources: authorised Facebook content, authorised Reddit content and our users' requests/offers. Initial synthetic examples must be visibly labelled. Broad live Facebook discovery is not secured.

## Provider decisions

- ElevenLabs for voice transcription now, replaceable with a local model later.
- OpenAI Decisions for categorisation and relevance scoring.
- Proposed web/backend/database: Next.js, TypeScript, Tailwind and Supabase.
- Responses for extraction and post drafting is proposed and still needs confirmation.

See [concept](docs/concept.md), [stack and future folder ownership](docs/stack.md), and [.mozak/idea.md](.mozak/idea.md).

## Work boundary


Use the current local MOZAK CLI for project context and planning. Onboarding validation does not imply registration, accepted implementation goals or proof of market demand.

No open-source licence has been selected. No source content, user audio, personal profiles or API credentials should be committed.
