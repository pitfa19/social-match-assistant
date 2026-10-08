# social-match-assistant

## Intent

A Croatia-first, Zagreb-focused assistant with two editable profiles: a person/current goal profile and an item, request or offer profile. Help the user find suitable opportunities and prepare a grounded post for what they need or offer.

## Desired outcomes

- Explicit, user-confirmed profiles built from questions, text or voice.
- Find relevant requests/offers and explain constraints and missing information.
- Draft a publishable post using only confirmed facts, with manual user approval and posting.
- Combine three intended sources: authorised Facebook content, authorised Reddit content and requests/offers contributed by our own users. Profiles personalise matching but are not the opportunity supply.
- Provide a web interface early. Synthetic content is acceptable for the initial demo and must be labelled.

## Boundaries

Current owner authorization, October 8, 2026: private GitHub repository setup and MOZAK onboarding only. Do not implement the app, scaffold a framework, start workers, activate providers, spend API credits, ingest social content or deploy an internet-accessible app without further approval.


Keep API credentials out of Git and chat. Protect private user data. Apply deterministic hard constraints before AI ranking. Unknown fields remain unknown. Rank opportunities for the seeker, not people for employers or landlords.

## Assumptions

Owner-selected voice provider: ElevenLabs now, behind a replaceable adapter for a later local speech-to-text model. Owner-selected decision provider: OpenAI Decisions for category classification and relevance scoring. Decisions enriches data and ranks retrieved candidates, it does not replace storage, indexing or platform connectors.

Proposed infrastructure, not implementation approval: Next.js, React, TypeScript, Tailwind and Supabase PostgreSQL/Auth. PostgreSQL stores and retrieves records. OpenAI Responses for structured extraction and draft generation remains proposed, not yet separately confirmed. Source access and provider account capabilities must be verified.

## Open questions

- GitHub/MOZAK registration approval pins and acceptance of future planning inputs.
- Provider credentials, budget, retention settings and Croatian voice quality.
- Authorised Reddit ingestion and a lawful, platform-supported Facebook integration route.
- Extraction/drafting model choice and candidate-retrieval recall in Croatian.
- Final pilot user, main demo story, demand evidence and funding/business model.
