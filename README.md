# VoceViva — Vocal Coach & Accademia di Canto

Studio vocale interattivo nel browser: rilevamento dell'intonazione in tempo reale,
esercizi guidati al pianoforte, trainer di respirazione diaframmatica, solfeggio cantato,
studio brani con mix e coaching vocale AI (Gemini).

## Sezioni

| # | Sezione | Componente |
|---|---------|------------|
| 01 | Respirazione | `src/components/BreathingTrainer.tsx` |
| 02 | Riscaldamento | `src/components/WarmupCoach.tsx` |
| 03 | Solfeggio Cantato | `src/components/SolfeggioCoach.tsx` |
| 04 | Palestra Vocale (intonazione) | `src/components/PitchStudio.tsx` |
| 05 | Studio Brani MP3/WAV & Mix AI | `src/components/SongStudioDaw.tsx` |
| 06 | Estensione | `src/components/VocalRangeFinder.tsx` |
| 07 | Risonanza & Spettro Live | `src/components/AnatomyFormantLab.tsx` |
| 08 | Progressi | `src/components/VocalProgressSection.tsx` |

Motore audio condiviso (pitch detection, sintesi pianoforte, mastering, export WAV):
`src/utils/audioEngine.ts`. Server Express + API Gemini: `server.ts`.

## Avvio in locale

Requisiti: Node 20+ (oppure Bun).

```bash
bun install          # oppure: npm install
cp .env.example .env # inserisci la tua GEMINI_API_KEY
bun run dev          # oppure: npm run dev  → http://localhost:3000
```

Senza una `GEMINI_API_KEY` valida l'app funziona comunque: gli endpoint AI rispondono
con un feedback di riserva.

## Script

- `dev` / `start` — server Express con Vite in modalità middleware (porta 3000)
- `build` — build di produzione in `dist/` (servita da `server.ts` con `NODE_ENV=production`)
- `lint` — controllo dei tipi TypeScript (`tsc --noEmit`)
