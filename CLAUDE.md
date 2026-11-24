# VoceViva — note per lo sviluppo

- Stack: React 19 + Vite 8 + Tailwind 4, server Express (`server.ts`) che serve anche Vite in dev.
- UI e testi sono in **italiano**: mantieni l'italiano per tutto ciò che vede l'utente.
- Package manager: `bun` (lockfile `bun.lock`); anche `npm install` funziona.
- Prima di ogni commit: `npx tsc --noEmit` deve passare senza errori e `npx vite build` deve riuscire.
- Coach AI: prompt, schemi JSON e fallback statici di ogni endpoint stanno in `shared/coach.ts`; le chiamate ai
  provider (Claude consigliato, Gemini, OpenAI) in `shared/llmProviders.ts`. Sono usati sia dal server
  (`server.ts` + `llm.ts`: chiave dell'utente via header `X-LLM-*` o chiave del server in `.env`) sia dall'app in
  "modalità diretta" (`src/utils/directCoach.ts`: provider chiamato dal dispositivo con la chiave dell'utente).
  I moduli in `shared/` non devono importare codice Node/Express. Il fallback statico c'è sempre: non rimuoverlo.
- Le chiavi API degli utenti non devono mai essere salvate né scritte nei log del server.
- I punteggi mostrati all'utente devono derivare da misure reali (microfono/pitch detection),
  non da valori inventati o forzati in un intervallo.
