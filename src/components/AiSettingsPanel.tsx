import React, { useEffect, useState } from "react";
import { X, KeyRound, CheckCircle2, AlertTriangle, Loader2, ExternalLink, ShieldCheck } from "lucide-react";
import {
  AI_PROVIDERS,
  AiProvider,
  AiSettings,
  loadAiSettings,
  providerInfo,
  saveAiSettings,
} from "../utils/aiSettings";

interface ServerConfig {
  serverProvider: AiProvider | null;
  customBaseUrlAllowed: boolean;
}

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; model: string }
  | { status: "error"; message: string };

export function AiSettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(providerInfo("anthropic").defaultModel);
  const [baseUrl, setBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [hasSaved, setHasSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    const saved = loadAiSettings();
    setHasSaved(!!saved);
    if (saved) {
      setProvider(saved.provider);
      setApiKey(saved.apiKey);
      setModel(saved.model);
      setBaseUrl(saved.baseUrl);
    }
    setTest({ status: "idle" });
    fetch("/api/llm/server-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setServerConfig(c))
      .catch(() => setServerConfig(null));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const info = providerInfo(provider);
  const current: AiSettings = { provider, apiKey: apiKey.trim(), model: model.trim(), baseUrl: baseUrl.trim() };
  const canSave = current.apiKey !== "" && current.model !== "";

  const selectProvider = (p: AiProvider) => {
    setProvider(p);
    setModel(providerInfo(p).defaultModel);
    setBaseUrl("");
    setTest({ status: "idle" });
  };

  const runTest = async () => {
    setTest({ status: "testing" });
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-LLM-Provider": current.provider,
        "X-LLM-Api-Key": current.apiKey,
        "X-LLM-Model": current.model,
      };
      if (current.provider === "openai" && current.baseUrl) headers["X-LLM-Base-Url"] = current.baseUrl;
      const res = await fetch("/api/llm/test", { method: "POST", headers, body: "{}" });
      const data = await res.json();
      setTest(data.ok ? { status: "ok", model: data.model } : { status: "error", message: data.error });
    } catch {
      setTest({ status: "error", message: "Server VoceViva non raggiungibile." });
    }
  };

  const save = () => {
    saveAiSettings(current);
    setHasSaved(true);
    onClose();
  };

  const remove = () => {
    saveAiSettings(null);
    setApiKey("");
    setHasSaved(false);
    setTest({ status: "idle" });
  };

  const serverProviderLabel = serverConfig?.serverProvider
    ? providerInfo(serverConfig.serverProvider).label
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-settings-title"
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6 text-slate-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="ai-settings-title" className="flex items-center gap-2 text-lg font-semibold text-white">
              <KeyRound className="h-5 w-5 text-sky-400" />
              Impostazioni Coach AI
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Scegli il modello linguistico che genera i giudizi del Maestro e inserisci la tua chiave API.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Chiudi">
            <X className="h-5 w-5" />
          </button>
        </div>

        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Provider</legend>
          <div className="grid gap-2">
            {AI_PROVIDERS.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  provider === p.id ? "border-sky-500 bg-sky-500/10" : "border-slate-700 hover:border-slate-500"
                }`}
              >
                <input
                  type="radio"
                  name="ai-provider"
                  value={p.id}
                  checked={provider === p.id}
                  onChange={() => selectProvider(p.id)}
                  className="mt-1 accent-sky-500"
                />
                <span>
                  <span className="flex items-center gap-2 text-sm font-medium text-white">
                    {p.label}
                    {p.recommended && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-300">
                        Consigliato
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{p.note}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 grid gap-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="ai-key" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Chiave API
              </label>
              <a
                href={info.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
              >
                Ottieni una chiave <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex gap-2">
              <input
                id="ai-key"
                type={showKey ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTest({ status: "idle" });
                }}
                placeholder={info.keyPlaceholder}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="rounded-lg border border-slate-700 px-3 text-xs text-slate-300 hover:bg-slate-800"
              >
                {showKey ? "Nascondi" : "Mostra"}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="ai-model" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Modello
            </label>
            <input
              id="ai-model"
              type="text"
              spellCheck={false}
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setTest({ status: "idle" });
              }}
              placeholder={info.defaultModel || "nome del modello"}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {provider === "openai" && serverConfig?.customBaseUrlAllowed && (
            <div>
              <label htmlFor="ai-base-url" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                URL base (opzionale, servizi compatibili OpenAI)
              </label>
              <input
                id="ai-base-url"
                type="url"
                spellCheck={false}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://…/v1"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
              />
            </div>
          )}
        </div>

        {test.status !== "idle" && (
          <div
            className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
              test.status === "ok"
                ? "bg-emerald-500/10 text-emerald-300"
                : test.status === "error"
                ? "bg-rose-500/10 text-rose-300"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            {test.status === "testing" && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
            {test.status === "ok" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {test.status === "error" && <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>
              {test.status === "testing" && "Verifico il collegamento…"}
              {test.status === "ok" && `Collegamento riuscito con ${test.model}.`}
              {test.status === "error" && test.message}
            </span>
          </div>
        )}

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] leading-snug text-slate-400">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span>
            La chiave resta salvata solo in questo browser. Ad ogni richiesta viene inviata al server VoceViva
            esclusivamente per inoltrarla al provider scelto: non viene memorizzata né registrata. I costi d'uso
            sono addebitati sul tuo account del provider.
            {serverProviderLabel && !hasSaved && (
              <> Senza una tua chiave l'app usa quella configurata sul server ({serverProviderLabel}).</>
            )}
            {!serverProviderLabel && !hasSaved && (
              <> Senza chiave il coach mostra solo consigli generici offline.</>
            )}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          {hasSaved ? (
            <button type="button" onClick={remove} className="text-xs text-rose-300 hover:text-rose-200">
              Rimuovi chiave salvata
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={runTest}
              disabled={!canSave || test.status === "testing"}
              className="rounded-lg border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            >
              Prova collegamento
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-40"
            >
              Salva
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
