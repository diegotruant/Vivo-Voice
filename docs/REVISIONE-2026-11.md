# Revisione VoceViva — novembre 2026

Metodo: revisione del codice in tre parti indipendenti + test funzionali nel browser
(Chromium con microfono simulato che "canta" note note: La3 220 Hz, Do4, Mi4 con vibrato 5,5 Hz / ±7 cent)
+ ricerca di mercato.

## Verdetto per sezione

| Sezione | Stato | In sintesi |
|---|---|---|
| Motore di rilevamento intonazione | ✅ Funziona | Errore 0–9 cent da 65 a 1046 Hz, nessun errore d'ottava. Debole sotto Do2. |
| 01 Respirazione | ⚠️ Parziale | Animazione e barra del fiato (mic) reali. Punteggio stabilità predefinito 92 e forzato 50–99; contatore cicli bloccato a 1; valori "cmH₂O/mm" sono costanti di simulazione. |
| 02 Riscaldamento | ⚠️ Parziale | Timer, fasi e misuratore di volume reali. Punteggio fisso 76/94; il vocal fry (35–55 Hz) non è rilevabile. |
| 03 Solfeggio | ✅ Corretto (commit precedente) | Prima mandava in crash l'app. |
| 04 Palestra Vocale | ⚠️ Parziale | Intonazione dal vivo reale. Vibrato fisso "5,5 Hz ±28c" (mai calcolato). Simulatore e punteggi predefiniti (84/86) salvati come sessioni reali; il pianoforte guida rientra nel microfono e gonfia l'accuratezza. |
| 05 Studio Brani | ⚠️ Parziale | Registrazione, mixer, caricamento MP3/WAV ed export WAV funzionano. Diagnosi AI di fatto finta: i campi inviati/ricevuti non corrispondono al server, invia passaggi deboli inventati. Voce registrata in ritardo di ~100–300 ms. Crash se Gemini risponde vuoto. |
| 06 Estensione | ⚠️ Parziale | Il microfono rileva la nota; estensione scelta a mano. Passaggi di registro calcolati come percentuali fisse; profilo "rilevato" mostrato prima di cantare. |
| 07 Risonanza | ⚠️ Simulatore | Spettro del microfono reale, ma F1/F2/F3 vengono da un modello, non dalla voce. "Squillo %" misura il volume. Cursore "palato" non funzionante; il sintetizzatore si spegne da solo dopo 50 ms. |
| 08 Progressi | ⚠️ Parziale | Salvataggio in localStorage funziona, ma parte con 6 sessioni inventate, "91%" fisso, pulsante che aggiunge sessioni casuali. Solo la Palestra salva sessioni. |
| Coach AI (Gemini) | ⚠️ | Se Gemini fallisce, risposte di riserva mostrate come analisi vere (`isFallback` mai usato). |
| Voce del coach (TTS Gemini) | ❌ Non funziona | Il server etichetta PCM grezzo come WAV: il browser non lo riproduce e ripiega sulla sintesi vocale del browser (chiamata pagata e buttata). |
| Server / produzione | ⚠️ | `npm start` avvia il server di sviluppo; porta fissa 3000; API aperta senza limiti (rischio costi sulla chiave Gemini). |

## Priorità di correzione

1. **Onestà dei dati** — eliminare punteggi inventati/forzati, sessioni finte, simulatore salvato come reale; mostrare "non misurato"; segnalare quando il feedback AI è di riserva.
2. **Bug bloccanti** — contratto client/server dello Studio Brani, crash su risposte vuote, TTS Gemini, sintetizzatore formanti, contatore cicli respirazione, perdite di AudioContext/microfono.
3. **Misure reali** — vibrato nella Palestra, scarto rispetto alla nota target, cuffie/eco del pianoforte, estensione min/max dal microfono, indice di squillo come rapporto spettrale, compensazione latenza registrazione.
4. **Produzione e sicurezza** — modalità produzione, `PORT`, limiti di richiesta e rate limit sulle API.
5. **Mercato** — vedi sotto.

## Prodotti simili (ricerca di mercato)

Concorrenti più vicini: **Singing Carrots** (web, coach LLM + motore di intonazione, ~120 $/anno),
**Sing Sharp** (app, già venduta in Italia come "Lezioni di Canto"), **Yousician Singing**, Simply Sing,
Vanido, Erol Singer's Studio, VOIS; **BandLab** (DAW gratuito nel browser con AutoPitch);
strumenti professionali per formanti **VoceVista** (99–399 $) ed **Estill Voiceprint**.

Banale/già diffuso: intonazione in tempo reale, test estensione, vocalizzi al piano, progressi,
registrazione su base con correzione (BandLab gratis), etichetta "coach AI".

Raro o apparentemente unico: app **nativa italiana** con didattica italiana (non trovata nessuna startup italiana
di coach vocale AI); **solfeggio cantato con gesto di direzione 4/4**; **laboratorio formanti + coach LLM in un'unica
web app** per consumatori; il pacchetto completo in un solo prodotto; feedback parlato del coach.

Rischi: aspettative di precisione, latenza audio sul web (specie iOS/Safari), privacy della voce (GDPR, minori nelle scuole)
quando l'audio va a Gemini, credibilità del feedback LLM se non ancorato a misure reali.
Opportunità: conservatori, cori e insegnanti italiani; pannello per insegnanti; possibile collaborazione con
l'ambito accademico (es. VoiceWorm, Università di Bologna).

## Stato correzioni

- **Fase 1 — onestà dei dati: completata.** Nessun punteggio inventato o forzato in un intervallo; "non misurato" quando
  manca la misura; cronologia progressi vuota all'inizio; simulatore mai salvato come reale; vibrato della Palestra
  misurato davvero; modelli simulati dichiarati; avviso visibile quando il coach AI risponde con un testo di riserva;
  contratto client/server dello Studio Brani allineato; contatore cicli della Respirazione corretto.
- **Coach AI multi-provider: completato.** L'utente sceglie Claude (consigliato), Gemini o OpenAI e inserisce la propria chiave.
- **Fase 2 — bug, misure, produzione e sicurezza: completata.** Compensazione latenza nello Studio Brani; rilevatore di
  intonazione normalizzato (errore ≤0,2 cent da 65 a 1046 Hz su toni sintetici); vocal fry misurato nel riscaldamento;
  sintetizzatore formanti e "stop" corretti; Palestra aggiornata a ~15 Hz invece di 60; voce del coach senza
  interruzioni; avvio di produzione, porta configurabile, limite richieste AI per IP, errori JSON, header di sicurezza.
- **Punti aperti della fase 2: chiusi.** Calibrazione del microfono per dispositivo nel riscaldamento (soglia in dB
  rispetto al volume comodo); limiti di richieste condivisibili tra più istanze via Redis (`REDIS_URL`) e tetto
  giornaliero per la chiave del server (`SERVER_KEY_DAILY_LIMIT`); correzione d'intonazione musicale nello Studio Brani
  (tonalità stimata dalla voce o scelta dall'utente, vibrato preservato, TD-PSOLA, stereo; errore mediano da 33,5 a
  1,5 cent sul test sintetico). In sviluppo l'HMR di Vite usa lo stesso server HTTP (niente porta fissa 24678).
- Limiti noti: la correzione d'intonazione gira sul thread principale (~5 s per un take di 3 minuti, interfaccia ferma
  nel frattempo); in tonalità minore usa la scala minore naturale (per la sensibile alzata scegliere "Cromatica").
