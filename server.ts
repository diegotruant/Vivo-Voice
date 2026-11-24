import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY || GEMINI_KEY === "MY_GEMINI_API_KEY" || GEMINI_KEY.trim() === "") {
  console.warn(
    "\n⚠️  GEMINI_API_KEY mancante o segnaposto: il Coach AI non è attivo.\n" +
      "   Gli endpoint /api/vocal-coach/* risponderanno con consigli generici offline (isFallback: true).\n" +
      "   Imposta GEMINI_API_KEY nel file .env per abilitare l'analisi AI.\n"
  );
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

const TRAINING_MODULE_IDS = ["diaframma", "riscaldamento", "solfeggio", "palestra"];

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "15mb" }));

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
      if (audioBase64 && audioMimeType) {
        parts.push({
          inlineData: {
            mimeType: audioMimeType,
            data: audioBase64,
          },
        });
      }
      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: { parts },
        config: {
          systemInstruction:
            "Rispondi sempre in italiano come un esperto Vocal Coach. Fornisci indicazioni pratiche e fisiologiche su appoggio diaframmatico, posizione della laringe, morbidezza mandibolare, velo palatino e risonanza. " +
            MEASUREMENT_RULE,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              valutazioneSintetica: {
                type: Type.STRING,
                description: "Sintesi chiara della performance in 1-2 frasi.",
              },
              diagnosiIntonazione: {
                type: Type.STRING,
                description:
                  "Analisi della precisione in centesimi (crescente, calante o centrata) e causa fisiologica probabile.",
              },
              consiglioAnatomico: {
                type: Type.STRING,
                description:
                  "Indicazione pratica su laringe, velo palatino, lingua o sostegno costo-diaframmatico.",
              },
              esercizioCorrettivo: {
                type: Type.OBJECT,
                properties: {
                  titolo: { type: Type.STRING },
                  istruzioni: { type: Type.STRING },
                  obiettivo: { type: Type.STRING },
                },
                required: ["titolo", "istruzioni", "obiettivo"],
              },
              messaggioVocale: {
                type: Type.STRING,
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
      console.error("Error in /api/vocal-coach/analyze:", error);
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

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
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
            type: Type.OBJECT,
            properties: {
              titoloRisposta: { type: Type.STRING },
              spiegazioneFisiologica: { type: Type.STRING },
              azionePratica: { type: Type.STRING },
              routineConsigliata: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    passo: { type: Type.STRING },
                    dettaglio: { type: Type.STRING },
                  },
                  required: ["passo", "dettaglio"],
                },
              },
              sintesiVocale: {
                type: Type.STRING,
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
      console.error("Error in /api/vocal-coach/ask:", error);
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
      });
    }
  });

  // 3. Spoken Vocal Coach TTS Endpoint using gemini-3.8-flash-lite-tts
  app.post("/api/vocal-coach/tts", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Testo mancante per la sintesi vocale." });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [
          {
            role: "user",
            parts: [
              {
                text,
                speechMetadata: {
                  style: "Warm, articulate, encouraging Italian vocal coach",
                },
              } as any,
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.status(502).json({ error: "Nessun audio generato dal modello TTS." });
      }

      res.json({ audioBase64: base64Audio, mimeType: "audio/wav" });
    } catch (error: any) {
      console.error("Error in /api/vocal-coach/tts:", error);
      res.status(503).json({
        error: "Servizio TTS temporaneamente non disponibile, utilizzo sintesi vocale locale.",
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

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
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
            type: Type.OBJECT,
            properties: {
              feedbackMaestro: { type: Type.STRING },
              correzioneTecnica: { type: Type.STRING },
              prossimoPasso: { type: Type.STRING },
              fraseVocaleCoach: {
                type: Type.STRING,
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
      console.error("Error in /api/vocal-coach/lesson-coach:", error);
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
      res.status(200).json({ feedbackMaestro: intro, ...fallback, isFallback: true });
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
      if (audioBase64 && audioMimeType) {
        parts.push({
          inlineData: {
            mimeType: audioMimeType,
            data: audioBase64,
          },
        });
      }
      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: { parts },
        config: {
          systemInstruction:
            "Rispondi sempre in italiano come un Vocal Coach ed esperto Sound Engineer vocale. Fornisci un'analisi incoraggiante, concreta e tecnicamente precisa. " +
            MEASUREMENT_RULE,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sintesiPerformance: { type: Type.STRING },
              puntiDiForza: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    titolo: { type: Type.STRING },
                    dettaglio: { type: Type.STRING },
                  },
                  required: ["titolo", "dettaglio"],
                },
              },
              puntiDeboliDaAllenare: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    problema: { type: Type.STRING },
                    causaFisiologica: { type: Type.STRING },
                    esercizioConsigliato: { type: Type.STRING },
                    moduloApp: { type: Type.STRING, enum: TRAINING_MODULE_IDS },
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
                type: Type.OBJECT,
                properties: {
                  pitchCorrectionPercent: { type: Type.NUMBER },
                  eqPresenceDb: { type: Type.NUMBER },
                  compressionRatio: { type: Type.NUMBER },
                  reverbWetPercent: { type: Type.NUMBER },
                  motivazioneSoundEngineer: { type: Type.STRING },
                },
                required: [
                  "pitchCorrectionPercent",
                  "eqPresenceDb",
                  "compressionRatio",
                  "reverbWetPercent",
                  "motivazioneSoundEngineer",
                ],
              },
              messaggioVocaleCoach: { type: Type.STRING },
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
      console.error("Error in /api/vocal-coach/song-analyze:", error);
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
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`VoceViva Server listening on http://localhost:${PORT}`);
  });
}

startServer();
