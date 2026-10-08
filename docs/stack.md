# Stack and future workstream boundaries

Status: setup-only repository. No dependencies installed, app code scaffolded, providers called or workers launched for implementation.

## Provider decisions

- ElevenLabs voice transcription now, behind a replaceable Transcriber interface. A local speech-to-text implementation is a future option, not yet selected or benchmarked.
- OpenAI Decisions for categorising source records and evaluating relevance of retrieved candidates.
- Proposed Next.js, React, TypeScript and Tailwind web interface with Next.js API endpoints.
- Proposed Supabase PostgreSQL and Auth for storage, retrieval and private accounts.
- Proposed OpenAI Responses for profile extraction and post drafting. This additional role requires confirmation.

## Search architecture proposal

Authorised content -> normalised records with source provenance -> Decisions classification -> PostgreSQL storage/indexing -> structured and text candidate retrieval -> deterministic hard constraints -> Decisions relevance scoring -> suitable/uncertain/excluded results.

Decisions does not itself provide persistent indexing or source ingestion. Test candidate recall, Croatian synonyms and ranking quality. No better-than-RAG claim exists without a comparable evaluation. Sources are untrusted input, never executable instructions.

## Voice proposal

Record up to 60 seconds -> ElevenLabs transcript -> user edits text -> extract proposed fields -> user confirms -> search or draft. Typed input remains available. Keep API keys server-side and avoid storing raw audio by default. Provider retention must be checked separately. No local-model performance assumption.

## Planned folders, not yet created

```text
src/app/(ui)/      frontend pages
src/frontend/     forms, cards, voice recorder
src/app/api/       backend HTTP endpoints
src/backend/      providers, matching, persistence
src/integrations/ facebook/, reddit/, fixtures/
src/shared/       root-owned schemas and contracts
supabase/         backend-owned migrations and access policies
tests/            individually assigned test files
```

Future frontend, social integrations and backend leads have non-overlapping paths. Root owns shared schemas, root configuration, lockfile, MOZAK state and integration. Three separate services or a monorepo build system are not needed initially.

## Approval gates

Current authorization: repo/MOZAK setup plus two read-only research leads. No application implementation, provider activation, paid requests, live ingestion or deployment is authorised. Exact MOZAK registration review requires separately pinned owner approval. Verify organiser preparation rules before implementing a competition solution.
