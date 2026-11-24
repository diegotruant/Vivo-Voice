/**
 * "Modalità diretta": the AI coach runs on this device and calls the provider (Claude, Gemini,
 * OpenAI) with the user's own key, without a VoceViva server. Same prompts, schemas and offline
 * fallbacks as the server (shared/coach.ts). Loaded lazily by coachFetch only in this mode.
 */
import { runCoach, CoachInputError, COACH_ENDPOINTS, type CoachEndpoint } from "../../shared/coach";
import {
  generateJson,
  geminiTts,
  testConnection,
  describeLlmError,
  DEFAULT_MODELS,
  LlmNotConfiguredError,
  LlmUserFacingError,
  type LlmConfig,
} from "../../shared/llmProviders";
import type { AiSettings } from "./aiSettings";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function toConfig(settings: AiSettings | null): LlmConfig {
  if (!settings?.apiKey) throw new LlmNotConfiguredError("Nessuna chiave AI configurata");
  const model = settings.model.trim() || DEFAULT_MODELS[settings.provider];
  if (!model) throw new LlmUserFacingError("Indica il nome del modello nelle impostazioni del Coach AI.");
  return {
    provider: settings.provider,
    apiKey: settings.apiKey,
    model,
    // From the user's own device a custom OpenAI-compatible URL carries no server-side risk.
    baseUrl: settings.provider === "openai" && settings.baseUrl.trim() ? settings.baseUrl.trim() : undefined,
    source: "user",
  };
}

/** Never logs the key: only the user-facing description of the error. */
function warn(where: string, error: unknown) {
  if (error instanceof LlmNotConfiguredError) return;
  console.warn(`[Coach AI diretto · ${where}] ${describeLlmError(error)}`);
}

/**
 * Same contract as the server endpoints (`/api/vocal-coach/<endpoint>`): returns a Response with the
 * same JSON, so components work unchanged in both connection modes.
 */
export async function runCoachDirect(path: string, body: unknown, settings: AiSettings | null): Promise<Response> {
  const endpoint = path.replace(/^\/api\/vocal-coach\//, "");
  const data = (body ?? {}) as Record<string, unknown>;

  if (endpoint === "tts") {
    // Only Gemini has TTS: otherwise 501 → the app uses the device's speech synthesis.
    if (!settings?.apiKey || settings.provider !== "gemini") {
      return jsonResponse(501, { error: "Sintesi vocale AI non disponibile con questo provider: uso la voce del dispositivo." });
    }
    const text = data.text;
    if (!text || typeof text !== "string") return jsonResponse(400, { error: "Testo mancante per la sintesi vocale." });
    try {
      const audio = await geminiTts(settings.apiKey, text);
      return audio ? jsonResponse(200, audio) : jsonResponse(502, { error: "Nessun audio generato dal modello TTS." });
    } catch (error) {
      warn("tts", error);
      return jsonResponse(503, { error: "Servizio TTS non disponibile, utilizzo sintesi vocale locale." });
    }
  }

  if (!(COACH_ENDPOINTS as string[]).includes(endpoint)) {
    return jsonResponse(404, { error: "Endpoint non trovato." });
  }

  try {
    const result = await runCoach(
      endpoint as CoachEndpoint,
      data,
      (jsonRequest) => generateJson(toConfig(settings), jsonRequest, { browser: true, effort: "low" }),
      (error) => warn(endpoint, error)
    );
    return jsonResponse(200, result);
  } catch (error) {
    if (error instanceof CoachInputError) return jsonResponse(400, { error: error.message });
    throw error;
  }
}

/** "Prova collegamento" in modalità diretta. */
export async function testDirectConnection(
  settings: AiSettings
): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
  try {
    const cfg = toConfig(settings);
    await testConnection(cfg, { browser: true, effort: "low" });
    return { ok: true, model: cfg.model };
  } catch (error) {
    warn("test", error);
    return { ok: false, error: describeLlmError(error) };
  }
}
