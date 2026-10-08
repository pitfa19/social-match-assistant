# Secret-safe public repository preflight

Owner request: 2026-10-08T16:30:37Z, keep API keys in deployment, remove them from the repository, then make pitfa19/social-match-assistant public. Audit baseline c5c15da, safeguard commit 84eea39. Repository was PRIVATE with only origin/main at b99ced0 before publication.

## Verified requirements

- Required credentials already exist in Railway's private variables: frontend OPENAI_API_KEY, ELEVENLABS_API_KEY, BACKEND_ACCESS_TOKEN, SITE_ACCESS_PASSWORD; backend MINDCASE_API_KEY, OPENAI_API_KEY, BACKEND_ACCESS_TOKEN, DATABASE_URL. No need to copy or replace existing working keys. No credential values were printed, saved to audit reports, rotated or committed.
- Actual local and deployed secret values, including database password and raw/URL-encoded/base64 forms, were compared in memory against every reachable Git object across all refs. Initial scan covered 55 commits, 453 trees and 491 blobs, 409 tracked files, 12 built production static files and 9 anonymously fetched public static assets plus HTML. 15 source-labelled secret entries, zero matches. Report: known-secret-scan.json.
- Gitleaks 8.30.1 was obtained from its official GitHub release into scratch only and checked against release SHA-256 checksums. Initial full-history scan found two occurrences of the same deliberately fake test key in backend MockTransport tests. .gitleaksignore suppresses only these exact commit/path/rule/line fingerprints. Rerun including safeguard commit: 56 commits, no unsuppressed findings. Separate commit-message scan: zero findings.
- Real env files .env.railway, backend/.env, frontend/.env.local and frontend/.env.development.local were never tracked in any fetched history and are ignored by Git and deployment upload rules. They are retained locally to avoid breaking the owner's local development. New frontend/.env.example contains blank secret values. Removing keys from the publishable repository therefore required no secret deletion or history rewrite: they were already outside Git.
- Source secret references are server-side handlers or backend configuration, not NEXT_PUBLIC variables or Next.js client env injection. Direct public asset checks above found no actual values.

## Other publication surfaces and privacy scope

GitHub API reported no Actions runs/artifacts, releases, PRs, open issues, issue comments, commit comments, forks or wiki; discussions disabled. Remote advertised only main and HEAD. Local design branch was scanned but is not being published.

An independent read-only reviewer inspected repository/history paths, text evidence and 17 distinct images among 78 unique tracked image hashes. Duplicates share reviewed content. The coordinator directly inspected three relevant screenshots as well. Four PNGs and related JSON evidence contain short public Reddit excerpts about carpet washing and temporary jobs. These show no author/handle/contact details; selected JSON bodies are 17 and 48 words, without email or Croatian phone patterns. They are non-sensitive public-post evidence, not API keys or private imported source dumps, and are retained under the owner's repository publication request. Other sampled images show test profiles and UI. This is bounded human image review, not a claim that every historical pixel was inspected. Public community source names/URLs, deployment IDs, aggregate collection receipts and local path metadata are repository documentation, not credentials. Raw imported corpora, env files and recordings stay ignored.

No credential leak or private-data publication blocker was found within this scope. No history rewriting, force-push, deletion, password reset, provider revocation or mutation of previously pinned evidence was justified or performed.

## Real deployed acceptance

At 16:35:54 to 16:36:21 UTC, APP_URL=https://kvartnakvadrat.up.railway.app ran verify-demo-api.mjs and LIVE_PROFILE=1 WITH_MICROPHONE=1 verify-demo-offers.mjs. Fifteen HTTP boundary checks passed. Real browser onboarding made three provider calls and zero stub calls, then the real matching API returned all three requested offers. Backend available, 1440/375/320 responsive checks passed, no page errors. Generated public-api.json and public-browser.json are retained beside this record. Static output labels containing local are legacy labels; APP_URL selected the actual public deployment.

Publication is the remaining step. No visibility claim is made by this preflight alone. Authentication policy, preview expiry, running deployment and real database remain unchanged. Older incomplete collection work stays PARTIAL and unrelated dirty source files remain untouched.
