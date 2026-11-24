import express from "express";
import type { NextFunction, Response } from "express";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import type { Request } from "express";
import {
  resolveLlmConfig,
  generateJson,
  serverDefaultProvider,
  describeLlmError,
  logLlmError,
  LlmNotConfiguredError,
  DEFAULT_MODELS,
  LLM_PROVIDERS,
  LlmUserFacingError,
  type LlmConfig,
} from "./llm";
import {
  createRateLimitStore,
  perIpLimiter,
  consumeServerKeyBudget,
  ServerKeyBudgetExceededError,
  type RateLimitStore,
} from "./rateLimit";

dotenv.config();

// `--production` (used by `npm start`) is the cross-platform way to select production mode.
if (process.argv.includes("--production")) process.env.NODE_ENV = "production";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const startupProvider = serverDefaultProvider();
if (!startupProvider) {
  console.warn(
    "\n⚠️  Nessuna chiave AI configurata sul server (ANTHROPIC_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY).\n" +
      "   Gli utenti possono inserire la propria chiave nelle Impostazioni Coach AI dell'app;\n" +
      "   senza chiave gli endpoint /api/vocal-coach/* rispondono con consigli generici offline (isFallback: true).\n"
  );
} else {
  console.log(`Coach AI: chiave del server configurata per il provider "${startupProvider}".`);
}

/** Rule appended to every coach prompt: feedback must be grounded in the measurements sent. */
const MEASUREMENT_RULE =
  "REGOLA FONDAMENTALE: basa il feedback esclusivamente sulle misure fornite. Non inventare numeri, " +
  "percentuali, centesimi, note o problemi non presenti nei dati. Se una misura è indicata come NON MISURATA, " +
  "dichiara che non è stata misurata e non fare ipotesi su di essa. Non fornire diagnosi mediche.";

const NOT_MEASURED = "NON MISURATO (non stimarlo né inventarlo)";

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Formats a numeric measurement for a prompt, or marks it as not measured. Never emits "undefined". */
function fmtMeasure(v: unknown, unit: string, signed = false): string {
  if (!isNum(v)) return NOT_MEASURED;
  return `${signed && v > 0 ? "+" : ""}${v}${unit}`;
}

function fmtText(v: unknown, fallback = NOT_MEASURED): string {
  return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 300) : fallback;
}

/**
 * Parses the model's JSON text and checks the required top-level fields.
 * Throws (→ endpoint fallback) when the response is empty, malformed or incomplete,
 * so the client never receives `{}`.
 */
function parseModelJson(text: string | undefined, required: string[]): Record<string, unknown> {
  if (!text) throw new Error("Risposta vuota dal modello");
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") throw new Error("Risposta non valida dal modello");
  const missing = required.filter((k) => parsed[k] === undefined || parsed[k] === null);
  if (missing.length > 0) throw new Error(`Campi mancanti nella risposta: ${missing.join(", ")}`);
  return parsed;
}

type GeminiStylePart = { text?: string; inlineData?: { mimeType: string; data: string } };

/**
 * Runs a structured (JSON) coach request on the provider configured for this request
 * (user key from the app settings, or the server key). Returns `{ text }` with the JSON text.
 */
async function callModel(
  req: Request,
  r: {
    contents: string | { parts: GeminiStylePart[] };
    config: { systemInstruction: string; responseMimeType?: string; responseSchema: Record<string, unknown> };
  }
): Promise<{ text: string }> {
  const cfg = await resolveConfigWithBudget(req);
  let prompt: string;
  let audio: { base64: string; mimeType: string } | undefined;
  if (typeof r.contents === "string") {
    prompt = r.contents;
  } else {
    prompt = r.contents.parts.map((p) => p.text ?? "").join("\n");
    const a = r.contents.parts.find((p) => p.inlineData)?.inlineData;
    if (a) audio = { base64: a.data, mimeType: a.mimeType };
  }
  const text = await generateJson(cfg, {
    system: r.config.systemInstruction,
    prompt,
    schema: r.config.responseSchema,
    audio,
  });
  return { text };
}

/** Extra fields on fallback responses so the UI can tell "no key configured" from "provider error". */
function fallbackInfo(error: unknown) {
  return {
    fallbackReason: error instanceof LlmNotConfiguredError ? "non-configurato" : "errore",
    fallbackMessage: describeLlmError(error),
  };
}

/** Wraps little-endian 16-bit PCM samples in a RIFF/WAV container. */
function pcm16ToWav(pcm: Buffer, sampleRate: number, channels: number): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const TRAINING_MODULE_IDS = ["diaframma", "riscaldamento", "solfeggio", "palestra"];

const ALLOWED_AUDIO_MIME = new Set([
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
]);

/** Returns the recorded audio only when it has an allowed MIME type and looks like base64; otherwise ignores it. */
function safeAudio(base64: unknown, mime: unknown): { data: string; mimeType: string } | null {
  if (typeof base64 !== "string" || typeof mime !== "string" || base64.length === 0) return null;
  const baseType = mime.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_AUDIO_MIME.has(baseType)) return null;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64.slice(0, 2000))) return null;
  return { data: base64, mimeType: baseType };
}

function envInt(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Rate-limit counters (memory, or Redis when REDIS_URL is set); created at startup. */
let rateLimitStore: RateLimitStore;

/**
 * Resolves the provider for this request; requests that would use the SERVER key also
 * consume its daily budget (SERVER_KEY_DAILY_LIMIT). User keys are not counted.
 */
async function resolveConfigWithBudget(req: Request): Promise<LlmConfig> {
  const cfg = resolveLlmConfig(req);
  if (cfg.source === "server") {
    try {
      await consumeServerKeyBudget(rateLimitStore, envInt("SERVER_KEY_DAILY_LIMIT", 0));
    } catch (e) {
      if (e instanceof ServerKeyBudgetExceededError) throw new LlmUserFacingError(e.message);
      throw e;
    }
  }
  return cfg;
}

async function startServer() {
  const app = express();
  const PORT = envInt("PORT", 3000);
  const HOST = process.env.HOST || "0.0.0.0";

  app.disable("x-powered-by");
  // Behind a reverse proxy (Render, Fly, nginx…) set TRUST_PROXY (e.g. "1") so req.ip is the client IP.
  if (process.env.TRUST_PROXY) {
    const tp = process.env.TRUST_PROXY;
    app.set("trust proxy", /^\d+$/.test(tp) ? Number(tp) : tp === "true" ? true : tp);
  }

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  rateLimitStore = await createRateLimitStore();
  console.log(`Limite richieste AI: archivio in ${rateLimitStore.kind}.`);
  const aiLimiter = perIpLimiter(
    rateLimitStore,
    envInt("AI_RATE_LIMIT_MAX", 30),
    envInt("AI_RATE_LIMIT_WINDOW_SEC", 300) * 1000
  );
  app.use("/api/vocal-coach", aiLimiter);
  app.use("/api/llm", aiLimiter);

  // Recorded audio travels as base64 (~+33%): 10 MB covers a few minutes of compressed audio.
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "10mb" }));

  // 0. AI provider info and connection test (used by the "Impostazioni Coach AI" panel)
  app.get("/api/llm/server-config", (_req, res) => {
    res.json({
      serverProvider: serverDefaultProvider(),
      providers: LLM_PROVIDERS,
      defaultModels: DEFAULT_MODELS,
      customBaseUrlAllowed: process.env.ALLOW_CUSTOM_LLM_BASE_URL === "true",
    });
  });

  app.post("/api/llm/test", async (req, res) => {
    try {
      const cfg = await resolveConfigWithBudget(req);
      const text = await generateJson(cfg, {
        system: "Rispondi solo con il JSON richiesto.",
        prompt: 'Conferma il collegamento rispondendo con {"ok": true}.',
        schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
      });
      JSON.parse(text);
      res.json({ ok: true, provider: cfg.provider, model: cfg.model, source: cfg.source });
    } catch (error) {
      if (!(error instanceof LlmNotConfiguredError)) logLlmError("/api/llm/test", error);
      res.status(200).json({ ok: false, error: describeLlmError(error) });
    }
  });

  // 1. Analyze Vocal Exercise Performance & Telemetry (with optional recorded audio)
  app.post("/api/vocal-coach/analyze", async (req, res) => {
    try {
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
      } = req.body;

      const promptText = `Sei un Maestro di Canto e Vocal Coach italiano di livello conservatoriale e moderno.
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

      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      const audio = safeAudio(audioBase64, audioMimeType);
      if (audio) parts.push({ inlineData: audio });
      parts.push({ text: promptText });

      const response = await callModel(req, {
        contents: { parts },
        config: {
          systemInstruction:
            "Rispondi sempre in italiano come un esperto Vocal Coach. Fornisci indicazioni pratiche e fisiologiche su appoggio diaframmatico, posizione della laringe, morbidezza mandibolare, velo palatino e risonanza. " +
            MEASUREMENT_RULE,
          responseMimeType: "application/json",
          responseSchema: {
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
        },
      });

      res.json(
        parseModelJson(response.text, [
          "valutazioneSintetica",
          "diagnosiIntonazione",
          "consiglioAnatomico",
          "esercizioCorrettivo",
          "messaggioVocale",
        ])
      );
    } catch (error: any) {
      logLlmError("/api/vocal-coach/analyze", error);
      // Static offline fallback (isFallback: true): generic advice, only echoing the client's own measured value
      const dev = req.body?.avgCentsDeviation;
      res.status(200).json({
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
        isFallback: true,
        ...fallbackInfo(error),
      });
    }
  });

  // 2. Custom Vocal Coach Consultation Q&A
  app.post("/api/vocal-coach/ask", async (req, res) => {
    try {
      const { question, voiceType, lowestNote, highestNote, recentAccuracy } = req.body;
      if (!question || typeof question !== "string") {
        return res.status(400).json({ error: "Inserisci una domanda valida per il Vocal Coach." });
      }

      const response = await callModel(req, {
        contents: `Profilo dello studente:
- Registro: ${fmtText(voiceType, "non specificato")}
- Estensione: ${
          typeof lowestNote === "string" && typeof highestNote === "string" && lowestNote && highestNote
            ? `${lowestNote} – ${highestNote}`
            : NOT_MEASURED
        }
- Accuratezza recente: ${fmtMeasure(recentAccuracy, "%")}

Domanda dello studente: "${question.slice(0, 2000)}"`,
        config: {
          systemInstruction:
            "Sei un Maestro di Canto professionista. Rispondi in italiano con precisione didattica, spiegando: 1) Perché accade il fenomeno vocale descritto, 2) Cosa fare fisicamente (respirazione, laringe, risonanza), 3) Un esercizio immediato passo-passo da provare subito. " +
            MEASUREMENT_RULE +
            " Se lo studente descrive dolore, raucedine persistente o perdita di voce, consiglia di rivolgersi a un foniatra o otorinolaringoiatra.",
          responseMimeType: "application/json",
          responseSchema: {
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
        },
      });

      const parsed = parseModelJson(response.text, [
        "titoloRisposta",
        "spiegazioneFisiologica",
        "azionePratica",
        "routineConsigliata",
        "sintesiVocale",
      ]);
      if (!Array.isArray(parsed.routineConsigliata)) parsed.routineConsigliata = [];
      res.json(parsed);
    } catch (error: any) {
      logLlmError("/api/vocal-coach/ask", error);
      res.status(200).json({
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
        isFallback: true,
        ...fallbackInfo(error),
      });
    }
  });

  // 3. Spoken coach voice. Only Gemini offers TTS among the supported providers: with Claude/OpenAI
  //    (or no key) the server answers 501 and the browser uses its own speech synthesis.
  app.post("/api/vocal-coach/tts", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Testo mancante per la sintesi vocale." });
      }

      const cfg = await resolveConfigWithBudget(req);
      if (cfg.provider !== "gemini") {
        return res.status(501).json({ error: "Sintesi vocale AI non disponibile con questo provider: uso la voce del browser." });
      }

      const ai = new GoogleGenAI({ apiKey: cfg.apiKey });
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts",
        contents: [
          {
            role: "user",
            parts: [{ text: text.slice(0, 1000), speechMetadata: { style: "Warm, articulate, encouraging Italian vocal coach" } }],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
        },
      });

      const inline = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
      if (!inline?.data) {
        return res.status(502).json({ error: "Nessun audio generato dal modello TTS." });
      }

      // Gemini TTS returns raw 16-bit PCM (audio/L16;rate=24000), which browsers cannot play:
      // wrap it in a WAV header.
      const mime = inline.mimeType || "";
      if (/wav/i.test(mime)) {
        return res.json({ audioBase64: inline.data, mimeType: "audio/wav" });
      }
      const rate = Number(/rate=(\d+)/i.exec(mime)?.[1]) || 24000;
      const wav = pcm16ToWav(Buffer.from(inline.data, "base64"), rate, 1);
      res.json({ audioBase64: wav.toString("base64"), mimeType: "audio/wav" });
    } catch (error: any) {
      if (!(error instanceof LlmNotConfiguredError)) logLlmError("/api/vocal-coach/tts", error);
      res.status(503).json({
        error: "Servizio TTS non disponibile, utilizzo sintesi vocale locale.",
      });
    }
  });

  // 4. Active Lesson & Solfeggio / Breathing Coach Feedback
  app.post("/api/vocal-coach/lesson-coach", async (req, res) => {
    try {
      const {
        moduleType, // "solfeggio" | "respirazione" | "lezione-completa"
        exerciseName,
        scorePercent,
        details,
        voiceType,
      } = req.body;

      const response = await callModel(req, {
        contents: `Modulo didattico: ${fmtText(moduleType, "lezione di canto")}
Esercizio eseguito: ${fmtText(exerciseName, "non specificato")}
Registro allievo: ${fmtText(voiceType, "non specificato")}
Risultato misurato: ${fmtMeasure(scorePercent, "%")}
Dettagli tecnici: ${typeof details === "string" && details ? details.slice(0, 1500) : "nessun dettaglio fornito"}`,
        config: {
          systemInstruction:
            "Sei un Maestro di Canto e Solfeggio Cantato italiano. Guida l'allievo come in una vera lezione individuale in studio: spiega cosa ha fatto bene, correggi l'errore specifico (es. pre-fonazione mentale della nota nel solfeggio, divisione ritmica del quarto, o tenuta diaframmatica nella sibilante) e assegna il passo successivo. " +
            MEASUREMENT_RULE +
            " Se il risultato non è stato misurato, non lodare né criticare l'esecuzione: dai indicazioni su come eseguire bene l'esercizio.",
          responseMimeType: "application/json",
          responseSchema: {
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
            required: [
              "feedbackMaestro",
              "correzioneTecnica",
              "prossimoPasso",
              "fraseVocaleCoach",
            ],
          },
        },
      });

      res.json(
        parseModelJson(response.text, [
          "feedbackMaestro",
          "correzioneTecnica",
          "prossimoPasso",
          "fraseVocaleCoach",
        ])
      );
    } catch (error: any) {
      logLlmError("/api/vocal-coach/lesson-coach", error);
      // Static offline fallback, chosen by module so the tip matches the exercise just done
      const mod = String(req.body?.moduleType || "").toLowerCase();
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
      res.status(200).json({ feedbackMaestro: intro, ...fallback, isFallback: true, ...fallbackInfo(error) });
    }
  });

  // 5. Song Vocal Track Analysis (Strengths, Weaknesses, Training Plan & AI Vocal Processing Preset)
  app.post("/api/vocal-coach/song-analyze", async (req, res) => {
    try {
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
      } = req.body;

      const promptText = `Sei un Vocal Coach e Produttore Vocale di studio.
L'allievo ha appena registrato una traccia vocale cantando sopra il brano "${fmtText(songTitle, "Base Strumentale").slice(0, 120)}".
Dati telemetrici misurati sulla traccia vocale:
- Registro vocale: ${fmtText(voiceType, "non specificato")}
- Centratura cromatica (% di istanti entro ±32 cent dal semitono più vicino; NON è il confronto con la melodia del brano): ${fmtMeasure(accuracyPercent, "%")}
- Scarto medio in centesimi dal semitono più vicino: ${fmtMeasure(avgCentsDeviation, " cent", true)}
- Stabilità dell'intonazione: ${fmtMeasure(stabilityPercent, "%")}
- Vibrato: frequenza ${fmtMeasure(vibratoRateHz, " Hz")}, ampiezza ${fmtMeasure(vibratoExtentCents, " cent")}
- Estensione cantata nel take: ${
        typeof lowestSungNote === "string" && typeof highestSungNote === "string" && lowestSungNote && highestSungNote
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

      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      const audio = safeAudio(audioBase64, audioMimeType);
      if (audio) parts.push({ inlineData: audio });
      parts.push({ text: promptText });

      const response = await callModel(req, {
        contents: { parts },
        config: {
          systemInstruction:
            "Rispondi sempre in italiano come un Vocal Coach ed esperto Sound Engineer vocale. Fornisci un'analisi incoraggiante, concreta e tecnicamente precisa. " +
            MEASUREMENT_RULE,
          responseMimeType: "application/json",
          responseSchema: {
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
                  required: [
                    "problema",
                    "causaFisiologica",
                    "esercizioConsigliato",
                    "moduloApp",
                  ],
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
        },
      });

      const parsed = parseModelJson(response.text, [
        "sintesiPerformance",
        "puntiDiForza",
        "puntiDeboliDaAllenare",
        "presetCorrezioneAi",
        "messaggioVocaleCoach",
      ]);
      if (!Array.isArray(parsed.puntiDiForza)) parsed.puntiDiForza = [];
      if (!Array.isArray(parsed.puntiDeboliDaAllenare)) parsed.puntiDeboliDaAllenare = [];
      // Drop links to modules that don't exist in the app
      parsed.puntiDeboliDaAllenare = (parsed.puntiDeboliDaAllenare as Array<Record<string, unknown>>).map(
        (p) => (TRAINING_MODULE_IDS.includes(String(p?.moduloApp)) ? p : { ...p, moduloApp: undefined })
      );
      res.json(parsed);
    } catch (error: any) {
      logLlmError("/api/vocal-coach/song-analyze", error);
      res.status(200).json({
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
        isFallback: true,
        ...fallbackInfo(error),
      });
    }
  });

  // JSON errors for malformed/oversized bodies (express would otherwise answer with an HTML page).
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ error: "Richiesta troppo grande (registrazione audio troppo lunga)." });
    }
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Richiesta non valida (JSON malformato)." });
    }
    // Log only method/path and the error message: never headers (they may carry X-LLM-Api-Key).
    console.error(`[${req.method} ${req.path}] ${err?.name ?? "Error"}: ${String(err?.message ?? err).slice(0, 300)}`);
    res.status(err?.status && err.status < 500 ? err.status : 500).json({ error: "Errore interno del server." });
  });

  // One HTTP server for the app and (in development) Vite's HMR WebSocket, so dev mode does not
  // need a separate fixed port (24678) and several dev instances can run side by side.
  const server = http.createServer(app);

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath, { index: false, maxAge: "1h" }));
    app.use("/api", (_req, res) => res.status(404).json({ error: "Endpoint non trovato." }));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(
      `VoceViva Server (${IS_PRODUCTION ? "produzione" : "sviluppo"}) in ascolto su http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`
    );
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    console.error(
      err.code === "EADDRINUSE"
        ? `La porta ${PORT} è già in uso: imposta un'altra porta con la variabile PORT.`
        : `Errore del server HTTP: ${err.message}`
    );
    process.exit(1);
  });
}

startServer().catch((err) => {
  console.error("Avvio del server VoceViva non riuscito:", err);
  process.exit(1);
});
