# Zagreb demo acceptance, 2026-10-08

Owner-authorized local demo scope is recorded in zagreb-demo-inputs-v1.json. Existing dirty legacy frontend work and parallel Reddit/backend work were preserved.

## Observed checks
- Production Next build passed (implementation worker), independently typechecked and 15 unit tests passed.
- Coordinator Playwright run against localhost:3101 passed seven checks: hero and fully loaded real OSM map tiles, full-page single-question dialog/focus trap/Escape, microphone recording through actual ElevenLabs transcription and actual OpenAI Decisions into Maksimir map zoom, unknown-input clarification without movement, honest Pretraži placeholder, mobile/reduced-motion layout, and no runtime exceptions.
- Voice input was synthetic Croatian generated locally with installed espeak-ng, fed into Chromium's microphone. Transcription: “Zanima me kvart Maksimir u Zagrebu. Zanima me kvart”. Decisions selected maksimir, map reached zoom 14.60. This validates the live integration, not real human Croatian speech quality or this machine's physical microphone.
- Four additional safety checks passed: request guards, cancellation while microphone permission is pending (late tracks stopped and no upload), simulated provider failure leaves retry available without map movement, and supplied key values absent from src and browser bundles.
- Browser screenshots and result JSON live under browser/. Request failure test uses a stub; main voice/provider flow does not.
- Supplied keys are only in gitignored frontend/.env.local with 0600 permissions. No credentials or voice recordings included in this evidence or commit.

## Delivery and limits
- Running production preview at http://127.0.0.1:3101, bound to loopback only. Native opening was attempted but blocked by host NO_BROWSER setting. An Open Zagreb demo applet button and local address are provided instead; do not claim the user's browser was automatically opened.
- Exactly 11 approximate, hand-entered neighbourhood anchors supported. Unknown or ambiguous input requests clarification. This is not authoritative boundary mapping.
- Pretraži intentionally says it is not available. No TTS, ingestion, public deployment, persistent profile saving, or further conversation questions.
- In-memory rate limiting is local-demo grade, not production distributed abuse protection. OSM map requires internet access.
- Initial English synthetic voice was misrecognized and produced clarification. Croatian synthetic fixture subsequently passed. Human voice testing remains a user follow-up, not a claimed result.
