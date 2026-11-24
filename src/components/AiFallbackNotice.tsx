import React from "react";
import { AlertTriangle } from "lucide-react";
import { loadAiSettings, openAiSettings } from "../utils/aiSettings";

/**
 * Shown whenever a server response carries `isFallback: true`: the text the user is
 * reading is a static offline tip, NOT an AI analysis of their performance.
 */
export function AiFallbackNotice({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Coach AI non disponibile: questo è un consiglio generico offline, non un'analisi della tua
        esecuzione.{" "}
        <button type="button" onClick={openAiSettings} className="font-semibold underline hover:text-amber-200">
          {loadAiSettings() ? "Controlla le impostazioni del Coach AI" : "Configura il Coach AI"}
        </button>
      </span>
    </div>
  );
}

/** Formats a measured value, or "non misurato" when nothing was measured. */
export function formatMeasured(value: number | null | undefined, unit = "%"): string {
  return value === null || value === undefined || Number.isNaN(value)
    ? "non misurato"
    : `${value}${unit}`;
}
