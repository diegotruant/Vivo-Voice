# VoceViva — note per lo sviluppo

- Stack: React 19 + Vite 8 + Tailwind 4, server Express (`server.ts`) che serve anche Vite in dev.
- UI e testi sono in **italiano**: mantieni l'italiano per tutto ciò che vede l'utente.
- Package manager: `bun` (lockfile `bun.lock`); anche `npm install` funziona.
- Prima di ogni commit: `npx tsc --noEmit` deve passare senza errori e `npx vite build` deve riuscire.
- Gli endpoint `/api/vocal-coach/*` in `server.ts` chiamano Gemini e hanno sempre un fallback
  statico in caso di errore: non rimuoverlo.
- I punteggi mostrati all'utente devono derivare da misure reali (microfono/pitch detection),
  non da valori inventati o forzati in un intervallo.
