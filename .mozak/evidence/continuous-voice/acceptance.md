# Continuous voice acceptance, 2026-10-08

## Delivered
- Introduction is the main page, not a modal. Existing question order and removable notes remain.
- One explicit microphone start streams PCM16 to ElevenLabs Scribe Realtime. Server VAD uses 1.5 seconds of silence. Each committed transcript awaits semantic processing, then listening resumes without another click. No speech output.
- OpenAI Responses structured output writes concise Croatian facts and categorized topics with exact supporting quotes. Server validates quotes, counts, lengths, schema and conservative negation. Neighbourhood routing is unchanged by this goal.
- Pause releases microphone tracks. Completion, unmount, hidden tab, timeout and error release capture. Typed fallback remains usable.

## Observed acceptance
- `npm run typecheck`, `npm test`: 79 tests passed, `npm run build`: passed on final source.
- `frontend/scripts/verify-continuous-voice.mjs`: real ElevenLabs WebSocket and real app/OpenAI APIs, with locally synthesized Croatian audio injected as the microphone source. One microphone start, four silence-committed turns, exactly three profile API calls and one neighbourhood call. Maksimir selected, map revealed, all microphone tracks ended, note removal passed. `browser/live-results.json` records actual transcriptions and results. This verifies the real service pipeline with synthetic speech, not a human voice-quality study.
- `frontend/scripts/verify-continuous-safety.mjs`: real typed OpenAI flow preserves 'ne voli nogomet', excludes brother's tennis interest, selects exact MO Brezovica (`mo-brezovica`, zoom13.00, lat45.7243, lng15.9041). Permission denied falls back, late permission after pause stops tracks without token request. Controlled503 preserves current question/answer. Cross-origin token/profile requests403 before upstream calls.
- `browser/safety-results.json`:320/390/1440 widths have zero horizontal overflow, main section relative not fixed, voice above notes on mobile. No dialog. Desktop/mobile screenshots retained.
- Client `.next/static` scanned against actual server master keys without printing them: no matches. Master keys remain ignored server environment values, only single-use ElevenLabs token reaches browser.
- Controller tests cover paused audio replacement, stale/duplicate commits, late callbacks after stop, automatic resume, silence, typed errors and response grounding failure cases.

## Limitations and separate work
- Earlier synthetic MO Brezovica pronunciation was misrecognized and safely clarified. Final streaming fixture used Maksimir; exact MO Brezovica passed typed UI. Speech recognition and LLM summaries can still be wrong; notes are removable. Quote containment is not a proof of semantic entailment.
- Demo token route is same-origin/rate-limited, not an authenticated production service. In-memory per-IP limits remain demo-grade. No public deployment.
- Existing old verbatim clause helpers/tests remain unused by the profile route for backwards compatibility. Semantic extraction assertions are in server/semanticProfile.test.ts.
- Visual premium redesign and new map/motion request are separate sloth-owned work, not claimed completed here. Current CSS was parent commit5600f22. Catalogue/backend changes belong snail.
- Browser acceptance uses reduced motion for deterministic clicks. Motion quality is not established by this evidence.
