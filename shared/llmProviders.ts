/**
 * Provider calls shared by the server (Node) and the app in "modalità diretta" (browser / Android
 * WebView). No Node-only APIs here: SDKs are loaded lazily with dynamic import, so the browser
 * bundle only downloads the SDK of the provider actually used.
 */

export type LlmProvider = "anthropic" | "gemini" | "openai";

export const LLM_PROVIDERS: LlmProvider[] = ["anthropic", "gemini", "openai"];

/** Default model per provider. */
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

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface GenerateOptions {
  /** true when running in the browser / Android WebView with the user's own key. */
  browser?: boolean;
  /** Reasoning effort for Claude 5 models (default "low"). */
  effort?: Effort;
}

// ---------------------------------------------------------------------------
// JSON Schema helpers
// ---------------------------------------------------------------------------

export type JsonSchema = { [key: string]: unknown };

/**
 * Strict variant for Claude / OpenAI structured outputs: every object gets
 * additionalProperties:false and lists all its properties as required.
 */
export function strictSchema(schema: JsonSchema): JsonSchema {
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

/** Returns the model's raw JSON text. Throws on any provider error (→ endpoint fallback). */
export async function generateJson(cfg: LlmConfig, r: JsonRequest, opts: GenerateOptions = {}): Promise<string> {
  switch (cfg.provider) {
    case "anthropic":
      return generateWithClaude(cfg, r, opts);
    case "gemini":
      return generateWithGemini(cfg, r);
    case "openai":
      return generateWithOpenAI(cfg, r, opts);
  }
}

async function generateWithClaude(cfg: LlmConfig, r: JsonRequest, opts: GenerateOptions): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    maxRetries: 1,
    timeout: 90_000,
    // In "modalità diretta" the user's own key is used from their own device: allowed on purpose.
    dangerouslyAllowBrowser: !!opts.browser,
  });
  const useFallbacks = ANTHROPIC_FALLBACK_MODELS.has(cfg.model);
  const response = await client.beta.messages.create({
    model: cfg.model,
    max_tokens: 16000,
    system: r.system,
    messages: [{ role: "user", content: r.prompt }],
    output_config: {
      format: { type: "json_schema", schema: strictSchema(r.schema) },
      ...(supportsEffort(cfg.model) ? { effort: opts.effort ?? "low" } : {}),
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
  const { GoogleGenAI } = await import("@google/genai");
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

async function generateWithOpenAI(cfg: LlmConfig, r: JsonRequest, opts: GenerateOptions): Promise<string> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    maxRetries: 1,
    timeout: 90_000,
    dangerouslyAllowBrowser: !!opts.browser,
  });
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

/** Tiny request used by "Prova collegamento". */
export async function testConnection(cfg: LlmConfig, opts: GenerateOptions = {}): Promise<void> {
  const text = await generateJson(
    cfg,
    {
      system: "Rispondi solo con il JSON richiesto.",
      prompt: 'Conferma il collegamento rispondendo con {"ok": true}.',
      schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
    },
    opts
  );
  JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Gemini text-to-speech (the only provider here with TTS)
// ---------------------------------------------------------------------------

export const DEFAULT_GEMINI_TTS_MODEL = "gemini-3.8-flash-lite-tts";

/** Returns a playable WAV (base64), or null when the model produced no audio. */
export async function geminiTts(
  apiKey: string,
  text: string,
  model = DEFAULT_GEMINI_TTS_MODEL
): Promise<{ audioBase64: string; mimeType: "audio/wav" } | null> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
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
  if (!inline?.data) return null;
  const mime = inline.mimeType || "";
  if (/wav/i.test(mime)) return { audioBase64: inline.data, mimeType: "audio/wav" };
  // Gemini TTS returns raw 16-bit PCM (audio/L16;rate=24000), which browsers cannot play: wrap it in WAV.
  const rate = Number(/rate=(\d+)/i.exec(mime)?.[1]) || 24000;
  const wav = pcm16ToWav(base64ToBytes(inline.data), rate, 1);
  return { audioBase64: bytesToBase64(wav), mimeType: "audio/wav" };
}

/** Wraps little-endian 16-bit PCM samples in a RIFF/WAV container. */
export function pcm16ToWav(pcm: Uint8Array, sampleRate: number, channels: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const ascii = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i);
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

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
  // Browser: a provider that blocks direct calls (CORS) or no network surfaces as a connection error.
  if (/fetch|network|connection|cors/i.test(message) || (err as Error)?.name === "APIConnectionError") {
    return "Impossibile raggiungere il provider AI dal dispositivo: controlla la connessione.";
  }
  return "Impossibile contattare il provider AI.";
}
