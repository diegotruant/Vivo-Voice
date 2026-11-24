# VoceViva — Vocal Coach & Accademia di Canto

Studio vocale interattivo nel browser: rilevamento dell'intonazione in tempo reale,
esercizi guidati al pianoforte, trainer di respirazione diaframmatica, solfeggio cantato,
studio brani con mix e coaching vocale AI (Claude, Gemini o OpenAI, a scelta dell'utente).

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
`src/utils/audioEngine.ts`. Server Express: `server.ts`. Livello AI multi-provider: `llm.ts`.

## Coach AI: scegli il tuo modello

Dal pulsante **"Configura Coach AI"** in alto, ogni utente sceglie il provider e inserisce la propria chiave:

| Provider | Note |
|---|---|
| **Anthropic Claude** (consigliato) | Modello predefinito `claude-opus-5-5`. Analizza le misure della sessione. |
| Google Gemini | Può ascoltare anche l'audio registrato; abilita la voce sintetica del coach. |
| OpenAI / compatibile | Indicare il nome del modello. |

La chiave resta nel browser (localStorage) e viene inoltrata dal server al provider ad ogni richiesta,
senza essere salvata o registrata. In alternativa il gestore del server può configurare una chiave in `.env`
(vedi `.env.example`). Senza chiave l'app funziona comunque e il coach mostra consigli generici offline,
segnalati come tali.

## Avvio in locale

Requisiti: Node 20+ (oppure Bun).

```bash
bun install          # oppure: npm install
cp .env.example .env # facoltativo: chiave AI del server
bun run dev          # oppure: npm run dev  → http://localhost:3000
```

Senza chiave AI l'app funziona comunque: gli endpoint AI rispondono con un consiglio generico
di riserva, chiaramente segnalato all'utente.

## Script

- `dev` — server Express con Vite in modalità middleware (hot reload)
- `build` — build di produzione del client in `dist/`
- `start` — avvia il server in **produzione** (`--production`): serve `dist/`, senza Vite dev server
- `preview` — `build` + `start`
- `lint` — controllo dei tipi TypeScript (`tsc --noEmit`)

## Messa in produzione

```bash
bun install            # oppure: npm install
bun run build          # oppure: npm run build
PORT=8080 bun run start
```

Variabili d'ambiente del server (vedi `.env.example`):

| Variabile | Predefinito | Scopo |
|---|---|---|
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Porta e indirizzo di ascolto |
| `TRUST_PROXY` | — | Dietro un reverse proxy (Render, Fly, nginx…) impostalo, es. `1`, così il limite per IP usa l'IP reale del client |
| `AI_RATE_LIMIT_MAX` / `AI_RATE_LIMIT_WINDOW_SEC` | `30` / `300` | Richieste AI consentite per IP nella finestra (limite in memoria, per singolo processo) |
| `JSON_BODY_LIMIT` | `10mb` | Dimensione massima delle richieste (le registrazioni audio viaggiano in base64) |
| `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `LLM_MODEL`, `LLM_EFFORT` | — | Chiave AI del server, facoltativa (vedi sopra) |
| `ALLOW_CUSTOM_LLM_BASE_URL` | `false` | Solo per installazioni private: consente URL personalizzati compatibili OpenAI |

Sicurezza: le chiavi API inviate dagli utenti non vengono salvate né registrate nei log; le richieste malformate
o troppo grandi ricevono un errore JSON; l'audio è accettato solo nei formati `audio/webm`, `wav`, `ogg`, `mpeg`, `mp4`.
Il microfono richiede HTTPS (o `localhost`): pubblica l'app dietro un proxy con certificato TLS.
