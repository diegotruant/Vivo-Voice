import express from "express";
import type { NextFunction, Response } from "express";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
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
  testConnection,
  geminiTts,
  type LlmConfig,
} from "./llm";
import { runCoach, CoachInputError, type CoachEndpoint } from "./shared/coach";
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

  // CORS for the Android app (Capacitor serves the UI from https://localhost inside the WebView)
  // plus any extra origins in CORS_ORIGINS (comma-separated). Same-origin browser use needs none.
  const corsOrigins = new Set([
    "https://localhost",
    "capacitor://localhost",
    "http://localhost",
    ...(process.env.CORS_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim().replace(/\/+$/, ""))
      .filter(Boolean),
  ]);
  app.use("/api", (req, res, next) => {
    const origin = req.get("origin");
    if (origin && corsOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-LLM-Provider, X-LLM-Api-Key, X-LLM-Model, X-LLM-Base-Url"
      );
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") return res.sendStatus(origin && corsOrigins.has(origin) ? 204 : 403);
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
      await testConnection(cfg, { effort: "low" });
      res.json({ ok: true, provider: cfg.provider, model: cfg.model, source: cfg.source });
    } catch (error) {
      if (!(error instanceof LlmNotConfiguredError)) logLlmError("/api/llm/test", error);
      res.status(200).json({ ok: false, error: describeLlmError(error) });
    }
  });

  // Coach endpoints. Prompts, schemas and offline fallbacks live in shared/coach.ts, shared with the
  // app's "modalità diretta" (provider called from the device with the user's key).
  const coachRoute = (endpoint: CoachEndpoint) => async (req: Request, res: Response) => {
    try {
      const result = await runCoach(
        endpoint,
        req.body,
        async (jsonRequest) => generateJson(await resolveConfigWithBudget(req), jsonRequest),
        (error) => logLlmError(`/api/vocal-coach/${endpoint}`, error)
      );
      res.json(result);
    } catch (error) {
      if (error instanceof CoachInputError) return res.status(400).json({ error: error.message });
      throw error;
    }
  };
  // 1. Exercise analysis (Palestra) — 2. Q&A — 4. Lesson feedback — 5. Song take analysis
  app.post("/api/vocal-coach/analyze", coachRoute("analyze"));
  app.post("/api/vocal-coach/ask", coachRoute("ask"));
  app.post("/api/vocal-coach/lesson-coach", coachRoute("lesson-coach"));
  app.post("/api/vocal-coach/song-analyze", coachRoute("song-analyze"));

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
      const audio = await geminiTts(cfg.apiKey, text, process.env.GEMINI_TTS_MODEL || undefined);
      if (!audio) return res.status(502).json({ error: "Nessun audio generato dal modello TTS." });
      res.json(audio);
    } catch (error: any) {
      if (!(error instanceof LlmNotConfiguredError)) logLlmError("/api/vocal-coach/tts", error);
      res.status(503).json({
        error: "Servizio TTS non disponibile, utilizzo sintesi vocale locale.",
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
