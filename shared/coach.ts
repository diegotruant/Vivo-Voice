/**
 * VoceViva coach logic shared by the server and the app's "modalità diretta":
 * prompts, JSON schemas, post-processing and the static offline fallbacks of every coach endpoint.
 * No Node/Express imports: runs on the server and in the browser / Android WebView.
 */
import { describeLlmError, LlmNotConfiguredError, type JsonRequest, type JsonSchema } from "./llmProviders";

/** Rule appended to every coach prompt: feedback must be grounded in the measurements sent. */
export const MEASUREMENT_RULE =
  "REGOLA FONDAMENTALE: basa il feedback esclusivamente sulle misure fornite. Non inventare numeri, " +
  "percentuali, centesimi, note o problemi non presenti nei dati. Se una misura è indicata come NON MISURATA, " +
  "dichiara che non è stata misurata e non fare ipotesi su di essa. Non fornire diagnosi mediche.";

export const NOT_MEASURED = "NON MISURATO (non stimarlo né inventarlo)";

export function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Formats a numeric measurement for a prompt, or marks it as not measured. Never emits "undefined". */
export function fmtMeasure(v: unknown, unit: string, signed = false): string {
  if (!isNum(v)) return NOT_MEASURED;
  return `${signed && v > 0 ? "+" : ""}${v}${unit}`;
}

export function fmtText(v: unknown, fallback = NOT_MEASURED): string {
  return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 300) : fallback;
}

/**
 * Parses the model's JSON text and checks the required top-level fields.
 * Throws (→ endpoint fallback) when the response is empty, malformed or incomplete,
 * so the client never receives `{}`.
 */
export function parseModelJson(text: string | undefined, required: string[]): Record<string, unknown> {
  if (!text) throw new Error("Risposta vuota dal modello");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") throw new Error("Risposta non valida dal modello");
  const missing = required.filter((k) => parsed[k] === undefined || parsed[k] === null);
  if (missing.length > 0) throw new Error(`Campi mancanti nella risposta: ${missing.join(", ")}`);
  return parsed;
}

export const TRAINING_MODULE_IDS = ["diaframma", "riscaldamento", "solfeggio", "palestra"];

const ALLOWED_AUDIO_MIME = new Set([
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
]);

/** Returns the recorded audio only when it has an allowed MIME type and looks like base64; otherwise ignores it. */
export function safeAudio(base64: unknown, mime: unknown): { base64: string; mimeType: string } | undefined {
  if (typeof base64 !== "string" || typeof mime !== "string" || base64.length === 0) return undefined;
  const baseType = mime.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_AUDIO_MIME.has(baseType)) return undefined;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64.slice(0, 2000))) return undefined;
  return { base64, mimeType: baseType };
}

/** Extra fields on fallback responses so the UI can tell "no key configured" from "provider error". */
export function fallbackInfo(error: unknown) {
  return {
    fallbackReason: error instanceof LlmNotConfiguredError ? "non-configurato" : "errore",
    fallbackMessage: describeLlmError(error),
  };
}

/** Invalid input from the client (→ HTTP 400 with this Italian message). */
export class CoachInputError extends Error {}

export type CoachEndpoint = "analyze" | "ask" | "lesson-coach" | "song-analyze";

export const COACH_ENDPOINTS: CoachEndpoint[] = ["analyze", "ask", "lesson-coach", "song-analyze"];

type Body = Record<string, any>;

export interface CoachEndpointDef {
  /** Builds the model request from the client body (throws CoachInputError on invalid input). */
  build(body: Body): JsonRequest & { required: string[] };
  /** Normalizes the parsed model output before sending it to the UI. */
  postProcess(parsed: Record<string, unknown>, body: Body): Record<string, unknown>;
  /** Static offline advice (isFallback) shown when the AI is not available. */
  fallback(body: Body): Record<string, unknown>;
}

const identity = (p: Record<string, unknown>) => p;

export const COACH: Record<CoachEndpoint, CoachEndpointDef> = {
  // 1. Analyze Vocal Exercise Performance & Telemetry (with optional recorded audio)
  analyze: {
    build(body) {
      const {
        exerciseTitle,
        voiceType,
        accuracyPercent,
        avgCentsDeviation,
        stabilityPercent,
        tendency,
        criticalNotes,
        audioBase64,
        audioMimeType,
      } = body;
      const prompt = `Sei un Maestro di Canto e Vocal Coach italiano di livello conservatoriale e moderno.
Analizza la seguente sessione di allenamento vocale eseguita dallo studente:
- Esercizio svolto: ${fmtText(exerciseTitle, "Vocalizzo di intonazione")}
- Registro vocale impostato: ${fmtText(voiceType, "non specificato")}
- Accuratezza media intonazione: ${fmtMeasure(accuracyPercent, "%")}
- Deviazione media in centesimi di semitono: ${fmtMeasure(avgCentsDeviation, " cent", true)}${
        isNum(avgCentsDeviation) && typeof tendency === "string" && tendency ? ` (${tendency})` : ""
      }
- Stabilità di emissione e tenuta del fiato: ${fmtMeasure(stabilityPercent, "%")}
- Note con maggiore difficoltà: ${
        Array.isArray(criticalNotes) && criticalNotes.length > 0
          ? criticalNotes.slice(0, 20).join(", ")
          : "nessuna nota critica rilevata"
      }

Fornisci una valutazione tecnica rigorosa ma incoraggiante in lingua italiana, strutturata esattamente secondo lo schema JSON richiesto.`;
      return {
        system:
          "Rispondi sempre in italiano come un esperto Vocal Coach. Fornisci indicazioni pratiche e fisiologiche su appoggio diaframmatico, posizione della laringe, morbidezza mandibolare, velo palatino e risonanza. " +
          MEASUREMENT_RULE,
        prompt,
        audio: safeAudio(audioBase64, audioMimeType),
        schema: {
          type: "object",
          properties: {
            valutazioneSintetica: {
              type: "string",
              description: "Sintesi chiara della performance in 1-2 frasi.",
            },
            diagnosiIntonazione: {
              type: "string",
              description:
                "Analisi della precisione in centesimi (crescente, calante o centrata) e causa fisiologica probabile.",
            },
            consiglioAnatomico: {
              type: "string",
              description:
                "Indicazione pratica su laringe, velo palatino, lingua o sostegno costo-diaframmatico.",
            },
            esercizioCorrettivo: {
              type: "object",
              properties: {
                titolo: { type: "string" },
                istruzioni: { type: "string" },
                obiettivo: { type: "string" },
              },
              required: ["titolo", "istruzioni", "obiettivo"],
            },
            messaggioVocale: {
              type: "string",
              description:
                "Breve discorso naturale in prima persona (massimo 45 parole) che il Maestro pronuncia a voce allo studente.",
            },
          },
          required: [
            "valutazioneSintetica",
            "diagnosiIntonazione",
            "consiglioAnatomico",
            "esercizioCorrettivo",
            "messaggioVocale",
          ],
        },
        required: [
          "valutazioneSintetica",
          "diagnosiIntonazione",
          "consiglioAnatomico",
          "esercizioCorrettivo",
          "messaggioVocale",
        ],
      };
    },
    postProcess: identity,
    fallback(body) {
      // Generic advice, only echoing the client's own measured value
      const dev = body?.avgCentsDeviation;
      return {
        valutazioneSintetica:
          "Analisi AI non disponibile in questo momento. Di seguito un consiglio generale valido per questo tipo di esercizio.",
        diagnosiIntonazione: !isNum(dev)
          ? "Intonazione non misurata in questa sessione."
          : dev < -8
            ? `Lo scarto medio misurato è ${dev} cent (tendenza calante): spesso dipende da un calo del sostegno a fine frase o dal velo palatino troppo basso.`
            : dev > 8
              ? `Lo scarto medio misurato è +${dev} cent (tendenza crescente): attenzione a non spingere troppa aria sulla laringe durante l'ascesa.`
              : `Lo scarto medio misurato è ${dev > 0 ? "+" : ""}${dev} cent: intonazione media centrata.`,
        consiglioAnatomico:
          "Mantieni le costole inferiori espanse durante l'attacco del suono (appoggio) e immagina uno spazio verticale morbido nel retrobocca, come l'inizio di uno sbadiglio silenzioso.",
        esercizioCorrettivo: {
          titolo: "Lip Roll (Trillo Labiale) su Quinta Discendente",
          istruzioni:
            "Esegui una sirena morbida 5-4-3-2-1 facendo vibrare le labbra rilassate con un flusso d'aria continuo e costante.",
          obiettivo:
            "Scollegare la tensione laringea dall'altezza tonale ed equilibrare la pressione sottoglottica.",
        },
        messaggioVocale:
          "Il coach AI non è disponibile in questo momento. Un consiglio generale: prima di attaccare la nota più acuta prepara l'appoggio intercostale e lascia la gola libera e rilassata.",
      };
    },
  },

  // 2. Custom Vocal Coach Consultation Q&A
  ask: {
    build(body) {
      const { question, voiceType, lowestNote, highestNote, recentAccuracy } = body;
      if (!question || typeof question !== "string") {
        throw new CoachInputError("Inserisci una domanda valida per il Vocal Coach.");
      }
      return {
        prompt: `Profilo dello studente:
- Registro: ${fmtText(voiceType, "non specificato")}
- Estensione: ${
          typeof lowestNote === "string" && typeof highestNote === "string" && lowestNote && highestNote
            ? `${lowestNote} – ${highestNote}`
            : NOT_MEASURED
        }
- Accuratezza recente: ${fmtMeasure(recentAccuracy, "%")}

Domanda dello studente: "${question.slice(0, 2000)}"`,
        system:
          "Sei un Maestro di Canto professionista. Rispondi in italiano con precisione didattica, spiegando: 1) Perché accade il fenomeno vocale descritto, 2) Cosa fare fisicamente (respirazione, laringe, risonanza), 3) Un esercizio immediato passo-passo da provare subito. " +
          MEASUREMENT_RULE +
          " Se lo studente descrive dolore, raucedine persistente o perdita di voce, consiglia di rivolgersi a un foniatra o otorinolaringoiatra.",
        schema: {
          type: "object",
          properties: {
            titoloRisposta: { type: "string" },
            spiegazioneFisiologica: { type: "string" },
            azionePratica: { type: "string" },
            routineConsigliata: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  passo: { type: "string" },
                  dettaglio: { type: "string" },
                },
                required: ["passo", "dettaglio"],
              },
            },
            sintesiVocale: {
              type: "string",
              description: "Frase breve (max 40 parole) da leggere ad alta voce allo studente.",
            },
          },
          required: [
            "titoloRisposta",
            "spiegazioneFisiologica",
            "azionePratica",
            "routineConsigliata",
            "sintesiVocale",
          ],
        },
        required: [
          "titoloRisposta",
          "spiegazioneFisiologica",
          "azionePratica",
          "routineConsigliata",
          "sintesiVocale",
        ],
      };
    },
    postProcess(parsed) {
      if (!Array.isArray(parsed.routineConsigliata)) parsed.routineConsigliata = [];
      return parsed;
    },
    fallback() {
      return {
        titoloRisposta:
          "Coach AI non disponibile — consiglio generale sul passaggio di registro e la libertà laringea",
        spiegazioneFisiologica:
          "Quando saliamo verso le note acute, i muscoli costrittori esterni del collo tendono ad attivarsi se il supporto del fiato cede. La laringe sale eccessivamente riducendo lo spazio faringeo.",
        azionePratica:
          "Pensa le note acute come se scendessero verso lo sterno mentre il palato molle si solleva dolcemente. Non aumentare il volume sugli acuti: alleggerisci la massa vocale entrando in voce mista.",
        routineConsigliata: [
          {
            passo: "1. Decompressione con Consonante Nasale 'NG'",
            dettaglio:
              "Pronuncia la parola 'Gong' e tieni il suono finale 'NG' sentendo la vibrazione sul dorso del naso, eseguendo piccole sirene di terza.",
          },
          {
            passo: "2. Apertura su Vocale Stretta 'U' o 'I'",
            dettaglio:
              "Canta la scala 1-2-3-4-5-4-3-2-1 sulla sillaba 'Vu' mantenendo le guance morbide e il flusso d'aria continuo.",
          },
          {
            passo: "3. Stabilizzazione dell'Appoggio",
            dettaglio:
              "Prima della nota più alta, espandi lateralmente le costole fluttuanti senza irrigidire le spalle.",
          },
        ],
        sintesiVocale:
          "Per liberare le note acute non spingere con la gola: alleggerisci il volume, alza il velo palatino e sostieni il suono espandendo le costole inferiori.",
      };
    },
  },

  // 4. Active Lesson & Solfeggio / Breathing Coach Feedback
  "lesson-coach": {
    build(body) {
      const {
        moduleType, // "solfeggio" | "respirazione" | "lezione-completa"
        exerciseName,
        scorePercent,
        details,
        voiceType,
      } = body;
      return {
        prompt: `Modulo didattico: ${fmtText(moduleType, "lezione di canto")}
Esercizio eseguito: ${fmtText(exerciseName, "non specificato")}
Registro allievo: ${fmtText(voiceType, "non specificato")}
Risultato misurato: ${fmtMeasure(scorePercent, "%")}
Dettagli tecnici: ${typeof details === "string" && details ? details.slice(0, 1500) : "nessun dettaglio fornito"}`,
        system:
          "Sei un Maestro di Canto e Solfeggio Cantato italiano. Guida l'allievo come in una vera lezione individuale in studio: spiega cosa ha fatto bene, correggi l'errore specifico (es. pre-fonazione mentale della nota nel solfeggio, divisione ritmica del quarto, o tenuta diaframmatica nella sibilante) e assegna il passo successivo. " +
          MEASUREMENT_RULE +
          " Se il risultato non è stato misurato, non lodare né criticare l'esecuzione: dai indicazioni su come eseguire bene l'esercizio.",
        schema: {
          type: "object",
          properties: {
            feedbackMaestro: { type: "string" },
            correzioneTecnica: { type: "string" },
            prossimoPasso: { type: "string" },
            fraseVocaleCoach: {
              type: "string",
              description: "Discorso diretto del Maestro da leggere a voce (max 40 parole).",
            },
          },
          required: ["feedbackMaestro", "correzioneTecnica", "prossimoPasso", "fraseVocaleCoach"],
        },
        required: ["feedbackMaestro", "correzioneTecnica", "prossimoPasso", "fraseVocaleCoach"],
      };
    },
    postProcess: identity,
    fallback(body) {
      // Chosen by module so the tip matches the exercise just done
      const mod = String(body?.moduleType || "").toLowerCase();
      const intro = "Coach AI non disponibile: ecco un consiglio generale per questo esercizio.";
      const fallback = /respir|diaframm|appoggio/.test(mod)
        ? {
            correzioneTecnica:
              "Durante la sibilante 'SSS' mantieni le costole inferiori aperte il più a lungo possibile: il flusso deve restare uguale dall'inizio alla fine, senza spinte né cali improvvisi.",
            prossimoPasso:
              "Ripeti 3 cicli completi a ritmo comodo, allungando l'espirazione di un secondo solo quando il suono resta perfettamente costante.",
            fraseVocaleCoach:
              "Il coach AI non è disponibile. Ricorda: costole aperte, spalle ferme e un filo d'aria costante dall'inizio alla fine della sibilante.",
          }
        : /riscald|sovte|fry|trill/.test(mod)
          ? {
              correzioneTecnica:
                "Negli esercizi SOVTE (lip trill, cannuccia, 'NG') tieni il volume moderato: il riscaldamento deve preparare la voce senza affaticarla. Se senti sforzo in gola, abbassa volume e altezza.",
              prossimoPasso:
                "Completa le fasi in ordine con le pause indicate, poi passa a un vocalizzo leggero nella Palestra Vocale.",
              fraseVocaleCoach:
                "Il coach AI non è disponibile. Riscalda la voce con calma e a volume moderato: niente spinta, labbra e gola morbide.",
            }
          : {
              correzioneTecnica:
                "Nel solfeggio cantato non cercare la nota 'scivolando' dal basso: immagina il centro esatto della nota prima di attaccarla, appoggiando il fiato un istante prima di pronunciarne il nome.",
              prossimoPasso:
                "Ripeti la lettura a velocità moderata respirando silenziosamente sul quarto movimento prima dell'attacco sul battere.",
              fraseVocaleCoach:
                "Il coach AI non è disponibile. Ricorda di pensare la nota prima di emetterla: respira sul levare e attacca in modo pulito sul battere.",
            };
      return { feedbackMaestro: intro, ...fallback };
    },
  },

  // 5. Song Vocal Track Analysis (Strengths, Weaknesses, Training Plan & AI Vocal Processing Preset)
  "song-analyze": {
    build(body) {
      // Field names match exactly what SongStudioDaw sends
      const {
        songTitle,
        voiceType,
        accuracyPercent,
        stabilityPercent,
        avgCentsDeviation,
        vibratoRateHz,
        vibratoExtentCents,
        lowestSungNote,
        highestSungNote,
        weakPassages,
        audioBase64,
        audioMimeType,
      } = body;
      const prompt = `Sei un Vocal Coach e Produttore Vocale di studio.
L'allievo ha appena registrato una traccia vocale cantando sopra il brano "${fmtText(songTitle, "Base Strumentale").slice(0, 120)}".
Dati telemetrici misurati sulla traccia vocale:
- Registro vocale: ${fmtText(voiceType, "non specificato")}
- Centratura cromatica (% di istanti entro ±32 cent dal semitono più vicino; NON è il confronto con la melodia del brano): ${fmtMeasure(accuracyPercent, "%")}
- Scarto medio in centesimi dal semitono più vicino: ${fmtMeasure(avgCentsDeviation, " cent", true)}
- Stabilità dell'intonazione: ${fmtMeasure(stabilityPercent, "%")}
- Vibrato: frequenza ${fmtMeasure(vibratoRateHz, " Hz")}, ampiezza ${fmtMeasure(vibratoExtentCents, " cent")}
- Estensione cantata nel take: ${
        typeof lowestSungNote === "string" &&
        typeof highestSungNote === "string" &&
        lowestSungNote &&
        highestSungNote
          ? `${lowestSungNote} – ${highestSungNote}`
          : NOT_MEASURED
      }
- Passaggi critici rilevati con timestamp: ${
        Array.isArray(weakPassages) && weakPassages.length > 0
          ? JSON.stringify(weakPassages.slice(0, 30))
          : "nessun passaggio critico rilevato"
      }

Restituisci in JSON:
1. I punti di forza specifici dimostrati nell'interpretazione.
2. I punti deboli su cui allenarsi (con causa tecnica ed esercizio mirato consigliato).
3. I parametri ottimali di correzione e mastering AI (quantità pitch-correction, presenza EQ squillo 3kHz, compressione, riverbero) per fondere la voce con gli stem strumentali.
4. Un commento vocale del Maestro/Produttore da riprodurre via TTS.
Per ogni punto debole, "moduloApp" deve essere uno di: diaframma, riscaldamento, solfeggio, palestra.
Se non ci sono passaggi critici rilevati, non inventarne: indica punti deboli solo se supportati dai dati.`;
      return {
        system:
          "Rispondi sempre in italiano come un Vocal Coach ed esperto Sound Engineer vocale. Fornisci un'analisi incoraggiante, concreta e tecnicamente precisa. " +
          MEASUREMENT_RULE,
        prompt,
        audio: safeAudio(audioBase64, audioMimeType),
        schema: {
          type: "object",
          properties: {
            sintesiPerformance: { type: "string" },
            puntiDiForza: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  titolo: { type: "string" },
                  dettaglio: { type: "string" },
                },
                required: ["titolo", "dettaglio"],
              },
            },
            puntiDeboliDaAllenare: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  problema: { type: "string" },
                  causaFisiologica: { type: "string" },
                  esercizioConsigliato: { type: "string" },
                  moduloApp: { type: "string", enum: TRAINING_MODULE_IDS },
                },
                required: ["problema", "causaFisiologica", "esercizioConsigliato", "moduloApp"],
              },
            },
            presetCorrezioneAi: {
              type: "object",
              properties: {
                pitchCorrectionPercent: { type: "number" },
                eqPresenceDb: { type: "number" },
                compressionRatio: { type: "number" },
                reverbWetPercent: { type: "number" },
                motivazioneSoundEngineer: { type: "string" },
              },
              required: [
                "pitchCorrectionPercent",
                "eqPresenceDb",
                "compressionRatio",
                "reverbWetPercent",
                "motivazioneSoundEngineer",
              ],
            },
            messaggioVocaleCoach: { type: "string" },
          },
          required: [
            "sintesiPerformance",
            "puntiDiForza",
            "puntiDeboliDaAllenare",
            "presetCorrezioneAi",
            "messaggioVocaleCoach",
          ],
        },
        required: [
          "sintesiPerformance",
          "puntiDiForza",
          "puntiDeboliDaAllenare",
          "presetCorrezioneAi",
          "messaggioVocaleCoach",
        ],
      };
    },
    postProcess(parsed) {
      if (!Array.isArray(parsed.puntiDiForza)) parsed.puntiDiForza = [];
      if (!Array.isArray(parsed.puntiDeboliDaAllenare)) parsed.puntiDeboliDaAllenare = [];
      // Drop links to modules that don't exist in the app
      parsed.puntiDeboliDaAllenare = (parsed.puntiDeboliDaAllenare as Array<Record<string, unknown>>).map(
        (p) => (TRAINING_MODULE_IDS.includes(String(p?.moduloApp)) ? p : { ...p, moduloApp: undefined }),
      );
      return parsed;
    },
    fallback() {
      return {
        sintesiPerformance:
          "Coach AI non disponibile: nessuna analisi della tua esecuzione è stata generata. Usa le misure mostrate sopra e i consigli generali qui sotto.",
        puntiDiForza: [],
        puntiDeboliDaAllenare: [
          {
            problema: "Consiglio generale: tenuta dell'intonazione a fine frase",
            causaFisiologica:
              "Un calo del sostegno costo-diaframmatico negli ultimi secondi della frase tende a far calare l'intonazione.",
            esercizioConsigliato:
              "Sostenuto con sibilante 'SSS' nel modulo Respirazione, poi note tenute nella Palestra Vocale.",
            moduloApp: "diaframma",
          },
          {
            problema: "Consiglio generale: libertà laringea sui salti verso l'acuto",
            causaFisiologica:
              "Spingere volume sugli acuti alza la laringe e irrigidisce il passaggio di registro.",
            esercizioConsigliato: "Lip trill su sirena d'ottava nel modulo Riscaldamento.",
            moduloApp: "riscaldamento",
          },
        ],
        presetCorrezioneAi: {
          pitchCorrectionPercent: 70,
          eqPresenceDb: 3,
          compressionRatio: 3,
          reverbWetPercent: 18,
          motivazioneSoundEngineer:
            "valori standard (correzione morbida, leggera presenza a 3 kHz, compressione moderata), non calcolati sulla tua traccia.",
        },
        messaggioVocaleCoach:
          "Il coach AI non è disponibile in questo momento. Puoi comunque riascoltare il tuo take, regolare la correzione e allenarti con i moduli consigliati.",
      };
    },
  },
};

/**
 * Runs one coach endpoint: builds the request, calls `generate` (server key, user key on the server,
 * or the provider directly from the device), validates and post-processes the answer.
 * Any failure → the endpoint's static fallback marked isFallback. CoachInputError is re-thrown (HTTP 400).
 */
export async function runCoach(
  endpoint: CoachEndpoint,
  body: Body,
  generate: (r: JsonRequest) => Promise<string>,
  onError?: (error: unknown) => void,
): Promise<Record<string, unknown>> {
  const def = COACH[endpoint];
  let request: ReturnType<CoachEndpointDef["build"]>;
  request = def.build(body ?? {}); // CoachInputError propagates
  try {
    const { required, ...jsonRequest } = request;
    const text = await generate(jsonRequest);
    return def.postProcess(parseModelJson(text, required), body ?? {});
  } catch (error) {
    onError?.(error);
    return { ...def.fallback(body ?? {}), isFallback: true, ...fallbackInfo(error) };
  }
}

export type { JsonSchema };
