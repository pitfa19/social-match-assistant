# Project instructions

## Current scope

The owner approved local frontend implementation on October 8, 2026 at 10:46:41 UTC and requested Claude swarm workers at 10:47:24 UTC. Approved scope: Croatian hero, introduction chat/local voice, editable confirmed profile, synthetic search and drafting, tests and local preview. Use frontend/ and reserve backend/. No paid provider activation, live ingestion or public deployment. The accepted inputs and plan under .mozak/planning/ record this bounded authority.

## MOZAK

Load `mozak` before project work. Read fresh context with `mozak project context social-match-assistant` once registered. If unregistered, report that state and follow the exact discovery/review/owner-approval process. Use ready goals, drift reports and validated notes. Never fabricate approval artifacts or treat this README as implementation authority.

## Approved direction

Person/current-goal profile plus item/request/offer profile. Actions: find matches and prepare a grounded post. Three intended sources: authorised Facebook content, authorised Reddit content and our users' requests/offers. Distinguish synthetic, live imported and user-contributed records.

ElevenLabs provides voice transcription now, with a replaceable local adapter later. OpenAI Decisions provides categorisation and relevance evaluation. PostgreSQL owns persistent storage and retrieval. Responses extraction/drafting remains a proposal.

## Future parallel work

After separate implementation approval, allocate frontend, social integrations and backend work to separate folders as described in `docs/stack.md`. One root coordinator owns shared schemas, root configuration, the lockfile, MOZAK state and integration. Workers must not overwrite shared files or expand authorisation.

## Safety and verification

