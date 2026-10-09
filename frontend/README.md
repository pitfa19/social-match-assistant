# Frontend

Next.js 16 demo of the person experience, in Croatian and English.

- `/` landing page
- `/app` interactive flow: introduce yourself by text or voice, confirm an editable profile, pick a Zagreb area on the map, see matches

```bash
npm ci
npm run dev        # http://localhost:3000
npm run typecheck && npm test && npm run build
```

## What is real and what is not

- Matches are **synthetic demo offers**, labelled as such. The app does not call the MCP server or any live source.
- Profile extraction and voice use OpenAI and ElevenLabs only if `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` are set server-side (see `.env.example`). Without them those steps are unavailable.
- Neighbourhood data comes from `../shared/zagreb-neighbourhoods.json` (official city areas).

The agent-facing side of the project is the MCP server in [`../backend`](../backend). See [../docs/architecture.md](../docs/architecture.md).
