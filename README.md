# Vivo-Voice

Vivo-Voice is an Italian-first prototype for singing practice, vocal feedback, range exploration, warm-ups, solfeggio, and song-studio workflows.

> **Project status:** prototype under active engineering review. Some dashboard content and AI fallback responses may be demonstrative. Do not treat current scores as validated measurements until the audio-analysis benchmark is published.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS
- Node.js + Express
- Google Gemini API via `@google/genai`
- Web Audio API for microphone capture, analysis, playback, and WAV rendering

## Requirements

- A current Node.js LTS release supported by the installed Vite version
- Bun (the repository contains `bun.lock`)
- A Gemini API key for AI coach endpoints
- HTTPS for microphone access in deployed environments (localhost is generally treated as a secure context)

## Setup

1. Install dependencies:

   ```bash
   bun install --frozen-lockfile
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

3. Put your Gemini API key in `.env`:

   ```dotenv
   GEMINI_API_KEY=your_key_here
   ```

   Never commit `.env`, API keys, recordings, or other secrets.

4. Start the application:

   ```bash
   bun run dev
   ```

   The Express/Vite development server currently listens on port 3000.

## Quality checks

Run these before proposing or merging code changes:

```bash
bun run lint
bun run build
```

At the moment, `lint` runs the TypeScript compiler in no-emit mode. Automated DSP, API, and end-to-end test coverage is being added; until then, a successful build is not proof that every user workflow works correctly.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-side key for Gemini requests. Keep it out of browser bundles and version control. |
| `APP_URL` | Optional deployment URL described by the existing template; confirm actual runtime usage before relying on it. |

## Architecture

- `src/components/`: learning modules and song studio
- `src/utils/audioEngine.ts`: pitch detection, exercise definitions, audio processing and WAV helpers
- `src/types/vocal.ts`: shared TypeScript contracts
- `server.ts`: Express server and AI coach endpoints
- `docs/ENGINEERING_PLAN.md`: production-readiness audit, phases, acceptance criteria and research references

## Product and measurement principles

- Never present seeded or simulated sessions as real learner progress.
- Treat pitch, cents, vibrato, and stability as measurements only when they are calculated from valid audio frames with documented confidence rules.
- Keep deterministic audio analysis separate from AI-generated explanations.
- Label AI fallbacks and uncertainty clearly.
- Request microphone permission only when needed; stop microphone tracks when recording ends or a module is closed.
- Explain when audio is processed by a third-party service, and do not upload recordings without clear user awareness and consent.
- Educational advice is not a medical diagnosis. Users should stop exercises if they experience pain or persistent discomfort.

## Development workflow

Work on a feature branch, make small changes, run quality checks, and review the diff before merging. For audio/DSP changes, include synthetic-signal tests and representative real-singing evaluation rather than relying on visual inspection of the interface.

See [docs/ENGINEERING_PLAN.md](docs/ENGINEERING_PLAN.md) for the current implementation roadmap and [docs/RESEARCH_MATRIX.md](docs/RESEARCH_MATRIX.md) for the research and capability matrix.
