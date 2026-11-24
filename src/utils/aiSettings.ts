/**
 * "Bring your own key" settings for the AI coach.
 *
 * Stored only in this browser (localStorage). Sent as request headers to the VoceViva server,
 * which forwards the call to the chosen provider without storing or logging the key.
 */
export type AiProvider = "anthropic" | "gemini" | "openai";

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface AiProviderInfo {
  id: AiProvider;
  label: string;
  recommended?: boolean;
  defaultModel: string;
  keyUrl: string;
  keyPlaceholder: string;
  note: string;
}

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic Claude",
    recommended: true,
    defaultModel: "claude-opus-5-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-…",
    note: "Feedback didattico accurato e risposte strutturate affidabili. Analizza le misure della sessione (l'audio registrato non viene inviato).",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-3.8-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza…",
    note: "Può ascoltare anche l'audio registrato e offre la voce sintetica del coach.",
  },
  {
    id: "openai",
    label: "OpenAI / compatibile",
    defaultModel: "",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-…",
    note: "Indica il nome esatto del modello. Analizza le misure della sessione (l'audio non viene inviato).",
  },
];

const STORAGE_KEY = "voceviva.ai-settings.v1";
const SERVER_URL_KEY = "voceviva.server-url.v1";

/** True inside the Android app (Capacitor WebView), false in a normal browser. */
export function isNativeApp(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/**
 * Base URL of the VoceViva server for API calls.
 * - Browser: empty → same origin as the page.
 * - Android app: the page is served from the APK, so the server must be explicit:
 *   user setting ("Server VoceViva"), else VITE_API_BASE_URL baked in at build time.
 */
export function getServerUrl(): string {
  const saved = localStorage.getItem(SERVER_URL_KEY)?.trim();
  const fromBuild = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  return (saved || fromBuild || "").replace(/\/+$/, "");
}

export function saveServerUrl(url: string): void {
  const clean = url.trim().replace(/\/+$/, "");
  if (clean) localStorage.setItem(SERVER_URL_KEY, clean);
  else localStorage.removeItem(SERVER_URL_KEY);
  window.dispatchEvent(new Event(AI_SETTINGS_CHANGED_EVENT));
}

/**
 * How the AI coach is reached:
 * - "diretta": from this device straight to the provider with the user's key (no server needed);
 * - "server": through a VoceViva server (same origin in the browser, or the "Server VoceViva" URL).
 */
export type ConnectionMode = "diretta" | "server";
const CONNECTION_MODE_KEY = "voceviva.connection-mode.v1";

/** Saved choice; default: diretta in the Android app without a server URL, server in the browser. */
export function getConnectionMode(): ConnectionMode {
  const saved = localStorage.getItem(CONNECTION_MODE_KEY);
  if (saved === "diretta" || saved === "server") return saved;
  return isNativeApp() && !getServerUrl() ? "diretta" : "server";
}

export function saveConnectionMode(mode: ConnectionMode): void {
  localStorage.setItem(CONNECTION_MODE_KEY, mode);
  window.dispatchEvent(new Event(AI_SETTINGS_CHANGED_EVENT));
}

/** Absolute or same-origin URL for a server API path such as "/api/llm/test". */
export function apiUrl(path: string): string {
  return getServerUrl() + path;
}
export const AI_SETTINGS_CHANGED_EVENT = "voceviva:ai-settings-changed";
export const OPEN_AI_SETTINGS_EVENT = "voceviva:open-ai-settings";

export function providerInfo(id: AiProvider): AiProviderInfo {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0];
}

export function loadAiSettings(): AiSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<AiSettings>;
    if (!s.provider || !AI_PROVIDERS.some((p) => p.id === s.provider) || !s.apiKey) return null;
    return {
      provider: s.provider,
      apiKey: s.apiKey,
      model: s.model ?? providerInfo(s.provider).defaultModel,
      baseUrl: s.baseUrl ?? "",
    };
  } catch {
    return null;
  }
}

export function saveAiSettings(settings: AiSettings | null): void {
  if (settings) localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  else localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(AI_SETTINGS_CHANGED_EVENT));
}

export function openAiSettings(): void {
  window.dispatchEvent(new Event(OPEN_AI_SETTINGS_EVENT));
}

/** Headers carrying the user's provider choice; empty when the user has not set a key. */
export function aiHeaders(settings: AiSettings | null = loadAiSettings()): Record<string, string> {
  if (!settings) return {};
  const h: Record<string, string> = {
    "X-LLM-Provider": settings.provider,
    "X-LLM-Api-Key": settings.apiKey,
  };
  if (settings.model.trim()) h["X-LLM-Model"] = settings.model.trim();
  if (settings.provider === "openai" && settings.baseUrl.trim()) h["X-LLM-Base-Url"] = settings.baseUrl.trim();
  return h;
}

/**
 * POST JSON to a VoceViva coach endpoint. In "modalità diretta" the request runs on this device
 * (provider called with the user's key, see directCoach.ts) and returns an equivalent Response;
 * otherwise it goes to the VoceViva server with the user's AI settings in the X-LLM-* headers.
 */
export async function coachFetch(path: string, body: unknown, settings?: AiSettings | null): Promise<Response> {
  const s = settings === undefined ? loadAiSettings() : settings;
  if (getConnectionMode() === "diretta") {
    const { runCoachDirect } = await import("./directCoach"); // provider SDKs load only in this mode
    return runCoachDirect(path, body, s);
  }
  return fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...aiHeaders(s) },
    body: JSON.stringify(body),
  });
}
