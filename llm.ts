/**
 * Provider-agnostic LLM layer for the VoceViva coach.
 *
 * The user can bring their own key ("BYOK") from the app settings: the browser sends
 * provider / key / model in request headers on every call; the server forwards the call
 * to the chosen provider and never stores or logs the key. If no user key is sent, the
 * server falls back to the key configured in its own environment (.env), if any.
 */
import type { Request } from "express";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

export type LlmProvider = "anthropic" | "gemini" | "openai";

export const LLM_PROVIDERS: LlmProvider[] = ["anthropic", "gemini", "openai"];

/** Default model per provider (overridable by the user or by LLM_MODEL in .env). */
export const DEFAULT_MODELS: Record<LlmProvider, string | null> = {
  anthropic: "claude-opus-5-5",
  gemini: "gemini-3.8-flash",
  openai: null, // the user must name the model (e.g. the one their OpenAI-compatible service offers)
};

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
  source: "user" | "server";
}

/** Thrown when no usable key is configured: endpoints answer with their static fallback. */
export class LlmNotConfiguredError extends Error {}

/** Shown to the user (Italian); never includes the key or raw provider payloads. */
export class LlmUserFacingError extends Error {}

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

// ---------------------------------------------------------------------------
// JSON Schema helpers
// ---------------------------------------------------------------------------

type JsonSchema = { [key: string]: unknown };

/**
 * Strict variant for Claude / OpenAI structured outputs: every object gets
 * additionalProperties:false and lists all its properties as required.
 */
function strictSchema(schema: JsonSchema): JsonSchema {
  const out: JsonSchema = { ...schema };
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    const props: JsonSchema = {};
    for (const [k, v] of Object.entries(out.properties as JsonSchema)) props[k] = strictSchema(v as JsonSchema);
    out.properties = props;
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  if (out.type === "array" && out.items) out.items = strictSchema(out.items as JsonSchema);
  return out;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface JsonRequest {
  system: string;
  prompt: string;
  schema: JsonSchema;
  /** Optional recorded audio: only Gemini can listen to it; other providers use the measurements only. */
  audio?: { base64: string; mimeType: string };
}

/** Models that accept Anthropic's server-side refusal fallback chain. */
const ANTHROPIC_FALLBACK_MODELS = new Set([
  "claude-fable-5-2",
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);

/** Claude 5-generation models accept output_config.effort. */
const supportsEffort = (model: string) => /^claude-(opus|sonnet|haiku|fable|mythos)-5/.test(model);

const LLM_EFFORT = (["low", "medium", "high", "xhigh", "max"] as const).find(
  (e) => e === process.env.LLM_EFFORT
) ?? "low";

/** Returns the model's raw JSON text. Throws on any provider error (→ endpoint fallback). */
export async function generateJson(cfg: LlmConfig, r: JsonRequest): Promise<string> {
  switch (cfg.provider) {
    case "anthropic":
      return generateWithClaude(cfg, r);
    case "gemini":
      return generateWithGemini(cfg, r);
    case "openai":
      return generateWithOpenAI(cfg, r);
  }
}

async function generateWithClaude(cfg: LlmConfig, r: JsonRequest): Promise<string> {
  const client = new Anthropic({ apiKey: cfg.apiKey, maxRetries: 1, timeout: 90_000 });
  const useFallbacks = ANTHROPIC_FALLBACK_MODELS.has(cfg.model);
  const response = await client.beta.messages.create({
    model: cfg.model,
    max_tokens: 16000,
    system: r.system,
    messages: [{ role: "user", content: r.prompt }],
    output_config: {
      format: { type: "json_schema", schema: strictSchema(r.schema) },
      ...(supportsEffort(cfg.model) ? { effort: LLM_EFFORT } : {}),
    },
    // On a safety decline the API re-runs the request on a fallback model chosen by refusal category.
    ...(useFallbacks
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
  });

  if (response.stop_reason === "refusal") throw new Error("Richiesta rifiutata dal modello");
  if (response.stop_reason === "max_tokens") throw new Error("Risposta troncata (max_tokens)");
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!text) throw new Error("Risposta vuota dal modello");
  return text;
}

async function generateWithGemini(cfg: LlmConfig, r: JsonRequest): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: cfg.apiKey });
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  if (r.audio) parts.push({ inlineData: { mimeType: r.audio.mimeType, data: r.audio.base64 } });
  parts.push({ text: r.prompt });
  const response = await ai.models.generateContent({
    model: cfg.model,
    contents: { parts },
    config: {
      systemInstruction: r.system,
      responseMimeType: "application/json",
      responseJsonSchema: r.schema,
    },
  });
  const text = response.text?.trim();
  if (!text) throw new Error("Risposta vuota dal modello");
  return text;
}

async function generateWithOpenAI(cfg: LlmConfig, r: JsonRequest): Promise<string> {
  const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl, maxRetries: 1, timeout: 90_000 });
  const completion = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      { role: "system", content: r.system },
      { role: "user", content: r.prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "risposta_coach", strict: true, schema: strictSchema(r.schema) },
    },
  });
  const choice = completion.choices[0];
  if (choice?.message?.refusal) throw new Error("Richiesta rifiutata dal modello");
  const text = choice?.message?.content?.trim();
  if (!text) throw new Error("Risposta vuota dal modello");
  return text;
}

/** Error text safe to show the user (no keys, no raw payloads). */
export function describeLlmError(err: unknown): string {
  if (err instanceof LlmUserFacingError) return err.message;
  if (err instanceof LlmNotConfiguredError) return "Nessuna chiave AI configurata.";
  const status = (err as { status?: number })?.status;
  const message = String((err as Error)?.message ?? "");
  if (status === 401 || status === 403 || /API[_ ]KEY[_ ]INVALID|api key not valid/i.test(message)) {
    return "Chiave API non valida o senza permessi per questo modello.";
  }
  if (status === 404) return "Modello non trovato: controlla il nome del modello.";
  if (status === 429) return "Limite di richieste o credito esaurito presso il provider.";
  if (status && status >= 500) return "Il provider AI non risponde in questo momento.";
  return "Impossibile contattare il provider AI.";
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
