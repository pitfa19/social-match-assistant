# Site design rework acceptance

Observed 2026-10-08T14:08:27.405Z. Owner approved the complete direction on 2026-10-08 at 13:32:50Z. The later solo-only direction was followed: no delegated work after the stop. Local preview verification only. This design task performed no public deployment.

## Delivered scope

- Edge-to-edge solid blue main page, not a modal or inset card. Notes do not exist until a real detail is extracted and disappear when the final note is removed. Requested question copy is “Kako bi se opisao?”. Current concurrent k²/kvart na kvadrat branding was preserved.
- Real simplified SVG geometry for 17 districts and 218 local committees, mapped by official codes to the existing catalogue. Three colloquial groups show their constituent official districts with an explicit disclaimer. No radius-circle approximation and no runtime tile/GIS download. Sources, response hashes, query URLs and licences are in the generated data and attribution file. Sava is attributed OpenStreetMap geometry.
- Interruptible spring camera, region selection by actual polygon or keyboard select, city reset, stable-size labels, north marker. First-detail layout transition, question/note entry and note exit, listening/connecting/processing states, truthful errors, reduced-motion and high-contrast support. No artificial response timers were added.
- Continuous voice and typed semantic extraction remain integrated. No credentials were added to client source.

## Direct acceptance

1. 37 browser checks passed on the real production UI with fixture answer APIs. Includes direct polygon click, MO Brezovica, Trešnjevka union, interrupt/reset, notes timing, desktop/mobile, keyboard, long content, empty extraction, ambiguity, service failure and reduced motion. Read browser/results.json.
2. Real provider regression passed with one microphone session, four silence-committed answers, three semantic profile requests, selected Maksimir, note removal and ended microphone tracks. Only microphone audio was synthetic. Read voice/live-results.json and the associated test script.
3. Real typed provider safety flow passed negation and third-party handling, selected the explicit local committee MO Brezovica, retained answers after service failure, rejected denied origins and released a late-granted stream after pause. Read voice/safety-results.json.
4. TypeScript, all 85 unit tests and the production build passed. No source file is newer than the built preview except evidence/test harness files. HTTP preview returned 200 with the requested question copy.
5. Screenshots were visually inspected at desktop and mobile widths, including the welcome page, first details, selected district, overview and the local committee map.

## Performance, measured and limited

The original three baseline runs moved the camera for 2033/2033/2033 ms and requested 84/84/84 map tiles. Final corrected timing runs moved it for 717/717/717 ms and requested 0/0/0 tiles. Final event-based click-to-map times were 30/29/30 ms.

These are actual browser-rendering observations at 1440×960 with no CPU/network throttling and fixture answer APIs, not a human latency study. The benchmark deliberately retained identical legacy profile fixtures, which current validation discards, so both samples have no extracted notes. The full notes layout is covered separately by browser and real provider acceptance. The original baseline field named clickToMapMs included Playwright waiting for actionability. It is not a valid comparative click latency. Corrected after-event-timing measurement separates that wait. Camera duration and request counts remain comparable observations, but target framing and the animation design changed. The baseline already had roughly 16.7 ms frame intervals: do not claim an FPS improvement. An earlier after run had three threshold-counted ~33.4 ms intervals, final corrected run had none.

## Limitations and preserved history

- Synthetic speech produced several transcription mistakes (for example “plazmu” and “brusilicu”). The flow/integration passed, not transcription accuracy. Extracted notes reflected those transcripts. This design task did not replace or recalibrate the speech provider.
- Geometry is simplified for display, not legal or cadastral use. The fixed SVG is a snapshot and does not promise live geographic updates. The welcome bundle carries geometry rather than fetching map tiles later.
- Native browser bridge was unavailable. Actual Chromium via the installed Playwright harness was used. Safari/Firefox and real-device testing were not performed.
- browser/failure.json/png preserve the first failed test attempt, caused by a fixture sending kind instead of topic. Corrected final browser/results.json supersedes that attempt. The application validation correctly ignored the malformed fixture.
- Other concurrent unrelated source/deployment work remains outside this commit. Current branding present in the owned Home component was preserved rather than reverted.

## Reproducibility and scope closure

Implementation commit: 54168887aacf73ee7a964cb2fb276b65dbbe6927. Build ID: 7Y57Sf86l3C_9ybp-1nxL.

Artifact and source manifest SHA-256: c246498512cc37ef485d506c63032050c69dac01a6fa180ddae7c0b2551fc24f. See artifact-manifest.json for source hashes, raw result hashes and preview response hash. Checkpoint maps every original criterion in contract.json to observations. Run the sequence checker against contract.json and checkpoint.json. Source implementation is committed, preview is refreshed, and no public release was performed.
