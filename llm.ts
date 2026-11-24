/**
 * Provider-agnostic LLM layer for the VoceViva coach.
 *
 * The user can bring their own key ("BYOK") from the app settings: the browser sends
 * provider / key / model in request headers on every call; the server forwards the call
 * to the chosen provider and never stores or logs the key. If no user key is sent, the
 * server falls back to the key configured in its own environment (.env), if any.
 */
import type { Request } from "express";
import {
  generateJson as generateJsonShared,
  LLM_PROVIDERS,
  DEFAULT_MODELS,
  LlmNotConfiguredError,
  LlmUserFacingError,
  type LlmConfig,
  type LlmProvider,
  type JsonRequest,
  type Effort,
} from "./shared/llmProviders";

// Provider calls, models and errors live in shared/llmProviders.ts (also used by the app in
// "modalità diretta"); this module adds what only the server needs: key resolution and logging.
export {
  LLM_PROVIDERS,
  DEFAULT_MODELS,
  LlmNotConfiguredError,
  LlmUserFacingError,
  describeLlmError,
  testConnection,
  geminiTts,
} from "./shared/llmProviders";
export type { LlmConfig, LlmProvider, JsonRequest } from "./shared/llmProviders";

function isPlaceholder(v: string | undefined): boolean {
  return !v || v.trim() === "" || /^MY_.*_KEY$/.test(v.trim());
}

function header(req: Request, name: string): string | undefined {
  const v = req.get(name);
  return v && v.trim() !== "" ? v.trim() : undefined;
}

function serverKeyFor(provider: LlmProvider): string | undefined {
  const key =
    provider === "anthropic"
      ? process.env.ANTHROPIC_API_KEY
      : provider === "gemini"
      ? process.env.GEMINI_API_KEY
      : process.env.OPENAI_API_KEY;
  return isPlaceholder(key) ? undefined : key!.trim();
}

/** Provider the server uses when the browser sends no key of its own. */
export function serverDefaultProvider(): LlmProvider | null {
  const preferred = process.env.LLM_PROVIDER as LlmProvider | undefined;
  if (preferred && LLM_PROVIDERS.includes(preferred) && serverKeyFor(preferred)) return preferred;
  return LLM_PROVIDERS.find((p) => serverKeyFor(p)) ?? null;
}

const customBaseUrlAllowed = () => process.env.ALLOW_CUSTOM_LLM_BASE_URL === "true";

/** Resolves which provider/key/model to use for this request. */
export function resolveLlmConfig(req: Request): LlmConfig {
  const userProvider = header(req, "x-llm-provider") as LlmProvider | undefined;
  const userKey = header(req, "x-llm-api-key");

  if (userKey) {
    if (!userProvider || !LLM_PROVIDERS.includes(userProvider)) {
      throw new LlmUserFacingError("Provider AI non valido nelle impostazioni.");
    }
    const model = header(req, "x-llm-model") ?? DEFAULT_MODELS[userProvider];
    if (!model) throw new LlmUserFacingError("Indica il nome del modello nelle impostazioni del Coach AI.");
    let baseUrl: string | undefined;
    const requestedBaseUrl = header(req, "x-llm-base-url");
    if (requestedBaseUrl && userProvider === "openai") {
      // Forwarding to arbitrary URLs from the server is an SSRF risk: only self-hosters may enable it.
      if (!customBaseUrlAllowed()) {
        throw new LlmUserFacingError(
          "Questo server non consente URL personalizzati per il provider AI (ALLOW_CUSTOM_LLM_BASE_URL)."
        );
      }
      baseUrl = requestedBaseUrl;
    }
    return { provider: userProvider, apiKey: userKey, model: model.slice(0, 100), baseUrl, source: "user" };
  }

  const provider = serverDefaultProvider();
  if (!provider) throw new LlmNotConfiguredError("Nessuna chiave AI configurata");
  const model = (process.env.LLM_MODEL && process.env.LLM_PROVIDER === provider
    ? process.env.LLM_MODEL
    : DEFAULT_MODELS[provider]) as string | null;
  if (!model) throw new LlmNotConfiguredError(`LLM_MODEL mancante per il provider ${provider}`);
  return {
    provider,
    apiKey: serverKeyFor(provider)!,
    model,
    baseUrl: provider === "openai" ? process.env.OPENAI_BASE_URL || undefined : undefined,
    source: "server",
  };
}

/** Read lazily: this module is imported before dotenv populates process.env. */
const llmEffort = (): Effort =>
  (["low", "medium", "high", "xhigh", "max"] as const).find((e) => e === process.env.LLM_EFFORT) ?? "low";

/** Server-side generation: same as the shared one, with the effort configured in .env. */
export function generateJson(cfg: LlmConfig, r: JsonRequest): Promise<string> {
  return generateJsonShared(cfg, r, { effort: llmEffort() });
}

/** Log line without secrets (provider SDK errors may echo request metadata). */
export function logLlmError(where: string, err: unknown): void {
  if (err instanceof LlmNotConfiguredError) return; // expected when no key is set: not an error
  if (err instanceof LlmUserFacingError) {
    console.warn(`[${where}] ${err.message}`);
    return;
  }
  const status = (err as { status?: number })?.status;
  const name = (err as Error)?.constructor?.name ?? "Error";
  const msg = String((err as Error)?.message ?? err).replace(/(sk-|AIza)[\w-]{8,}/g, "[chiave nascosta]");
  console.error(`[${where}] ${name}${status ? ` (${status})` : ""}: ${msg.slice(0, 300)}`);
}
