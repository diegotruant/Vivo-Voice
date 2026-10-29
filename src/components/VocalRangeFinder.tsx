import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  CheckCircle2,
  Compass,
  ArrowRight,
  Music,
} from "lucide-react";
import {
  VOICE_REGISTERS,
  formatMidiNote,
  freqToMidiFloat,
  detectPitchAutocorrelation,
  studioAudio,
} from "../utils/audioEngine";
import { VoiceRegisterId } from "../types/vocal";

interface VocalRangeFinderProps {
  selectedRegisterId: VoiceRegisterId;
  onApplyRegister: (
    id: VoiceRegisterId,
    lowNoteLabel: string,
    highNoteLabel: string
  ) => void;
}

export const VocalRangeFinder: React.FC<VocalRangeFinderProps> = ({
  selectedRegisterId,
  onApplyRegister,
}) => {
  const [lowMidi, setLowMidi] = useState<number>(48); // Default C3 (Do3)
  const [highMidi, setHighMidi] = useState<number>(72); // Default C5 (Do5)
  const [activeStep, setActiveStep] = useState<"low" | "high" | "result">("low");

  // Optional live microphone pitch capture for range detection
  const [isListening, setIsListening] = useState<boolean>(false);
  const [detectedMidi, setDetectedMidi] = useState<number | null>(null);
  const [detectedFreq, setDetectedFreq] = useState<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopMic = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setIsListening(false);
    setDetectedMidi(null);
    setDetectedFreq(null);
  };

  const toggleMicCapture = async () => {
    if (isListening) {
      stopMic();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      setIsListening(true);

      const buf = new Float32Array(2048);
      const loop = () => {
        if (analyserRef.current && audioCtxRef.current) {
          analyserRef.current.getFloatTimeDomainData(buf);
          const res = detectPitchAutocorrelation(buf, audioCtxRef.current.sampleRate);
          if (res) {
            const m = Math.round(freqToMidiFloat(res.freq));
            if (m >= 36 && m <= 88) {
              setDetectedMidi(m);
              setDetectedFreq(res.freq);
            }
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      setIsListening(false);
    }
  };

  useEffect(() => {
    return () => stopMic();
  }, []);

  // Calculate best matching vocal register based on lowMidi & highMidi center
  const matchedRegister = React.useMemo(() => {
    const userCenter = (lowMidi + highMidi) / 2;
    let best = VOICE_REGISTERS[2];
    let minDiff = 999;
    VOICE_REGISTERS.forEach((reg) => {
      const regCenter = (reg.minMidi + reg.maxMidi) / 2;
      const diff =
        Math.abs(userCenter - regCenter) +
        Math.abs(lowMidi - reg.minMidi) * 0.4 +
        Math.abs(highMidi - reg.maxMidi) * 0.4;
      if (diff < minDiff) {
        minDiff = diff;
        best = reg;
      }
    });
    return best;
  }, [lowMidi, highMidi]);

  const semitoneSpan = Math.max(1, highMidi - lowMidi);
  const octaveSpan = (semitoneSpan / 12).toFixed(1);
  const passaggioPrimo = Math.round(lowMidi + semitoneSpan * 0.58);
  const passaggioSecondo = Math.round(lowMidi + semitoneSpan * 0.78);

  // Full 4-octave visual range keyboard from E2 (40) to C6 (84)
  const allRangeMidis = Array.from({ length: 45 }, (_, i) => 40 + i);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Interactive Stage (8 cols) */}
      <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-xl p-6 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-xs text-slate-400">
              Diagnostica Vocale · Calcolo Tessitura e Passaggi di Registro
            </div>
            <h2 className="text-xl font-semibold text-slate-100 mt-0.5">
              Rilevatore Estensione Vocale (Vocal Range Finder)
            </h2>
          </div>

          <button
            type="button"
            onClick={toggleMicCapture}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              isListening
                ? "bg-rose-600 text-white"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200"
            }`}
          >
            {isListening ? (
              <>
                <Mic className="w-3.5 h-3.5" />
                <span>
                  Microfono Attivo{" "}
                  {detectedMidi ? `(${formatMidiNote(detectedMidi).noteIt})` : ""}
                </span>
              </>
            ) : (
              <>
                <MicOff className="w-3.5 h-3.5" />
                <span>Rileva Nota col Microfono</span>
              </>
            )}
          </button>
        </div>

        {/* Guided 3-Stage Stepper */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setActiveStep("low")}
            className={`p-3.5 rounded-lg border text-left transition-colors ${
              activeStep === "low"
                ? "bg-sky-950/70 border-sky-500 text-slate-100"
                : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <div className="text-xs text-sky-400 font-mono">Fase 01</div>
            <div className="text-sm font-semibold mt-0.5">Nota Più Grave</div>
            <div className="text-xs font-mono text-slate-300 mt-1">
              Attuale: {formatMidiNote(lowMidi).fullLabel}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveStep("high")}
            className={`p-3.5 rounded-lg border text-left transition-colors ${
              activeStep === "high"
                ? "bg-sky-950/70 border-sky-500 text-slate-100"
                : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <div className="text-xs text-sky-400 font-mono">Fase 02</div>
            <div className="text-sm font-semibold mt-0.5">Nota Più Acuta</div>
            <div className="text-xs font-mono text-slate-300 mt-1">
              Attuale: {formatMidiNote(highMidi).fullLabel}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveStep("result")}
            className={`p-3.5 rounded-lg border text-left transition-colors ${
              activeStep === "result"
                ? "bg-emerald-950/70 border-emerald-500 text-slate-100"
                : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <div className="text-xs text-emerald-400 font-mono">Fase 03</div>
            <div className="text-sm font-semibold mt-0.5">Mappa & Registro</div>
            <div className="text-xs font-mono text-slate-300 mt-1">
              {matchedRegister.name} ({octaveSpan} ottave)
            </div>
          </button>
        </div>

        {/* Active Step Control Box */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          {activeStep === "low" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-100">
                    01. Individua il tuo Limite Grave Confortevole
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Scendi gradualmente sulla vocale &ldquo;Oh&rdquo; senza forzare in fry vocale.
                    Ascolta la nota al pianoforte o catturala col microfono.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => studioAudio.playPianoNote(lowMidi, 1.2, 0.45)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 whitespace-nowrap shrink-0"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Ascolta {formatMidiNote(lowMidi).noteIt}</span>
                  </button>
                  {detectedMidi !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        if (detectedMidi < highMidi) setLowMidi(detectedMidi);
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap shrink-0"
                    >
                      Usa Nota Mic ({formatMidiNote(detectedMidi).noteIt})
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-300 font-medium">
                    Selettore Nota Più Grave Confortevole
                  </span>
                  <span className="font-mono tabular-nums text-sky-400 font-semibold">
                    {formatMidiNote(lowMidi).fullLabel} ·{" "}
                    {formatMidiNote(lowMidi).freq.toFixed(1)} Hz
                  </span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={highMidi - 5}
                  value={lowMidi}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setLowMidi(val);
                    studioAudio.playPianoNote(val, 0.7, 0.35);
                  }}
                  className="w-full h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveStep("high")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100"
                >
                  <span>Passa alla Nota Più Acuta</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}

          {activeStep === "high" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-100">
                    02. Individua il tuo Limite Acuto Pulito (Voce Piena / Mista)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Sali con una sirena morbida senza irrigidire il collo. Fermati all&apos;ultima
                    nota emessa con timbro pieno e sostenibile.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => studioAudio.playPianoNote(highMidi, 1.2, 0.45)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 whitespace-nowrap shrink-0"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Ascolta {formatMidiNote(highMidi).noteIt}</span>
                  </button>
                  {detectedMidi !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        if (detectedMidi > lowMidi) setHighMidi(detectedMidi);
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap shrink-0"
                    >
                      Usa Nota Mic ({formatMidiNote(detectedMidi).noteIt})
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-300 font-medium">
                    Selettore Nota Più Acuta Confortevole
                  </span>
                  <span className="font-mono tabular-nums text-sky-400 font-semibold">
                    {formatMidiNote(highMidi).fullLabel} ·{" "}
                    {formatMidiNote(highMidi).freq.toFixed(1)} Hz
                  </span>
                </div>
                <input
                  type="range"
                  min={lowMidi + 5}
                  max={84}
                  value={highMidi}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setHighMidi(val);
                    studioAudio.playPianoNote(val, 0.7, 0.35);
                  }}
                  className="w-full h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveStep("result")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <span>Visualizza Mappa Completa</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}

          {activeStep === "result" && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs text-emerald-400 font-semibold">
                  ● PROFILO VOCALE RILEVATO
                </div>
                <h3 className="text-lg font-semibold text-slate-100 mt-0.5">
                  Registro Consigliato: {matchedRegister.name} ({matchedRegister.rangeLabel})
                </h3>
                <p className="text-xs text-slate-300 mt-1 max-w-xl">
                  {matchedRegister.description}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  onApplyRegister(
                    matchedRegister.id,
                    formatMidiNote(lowMidi).noteIt,
                    formatMidiNote(highMidi).noteIt
                  )
                }
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors whitespace-nowrap shrink-0"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Applica Registro {matchedRegister.name} alla Palestra</span>
              </button>
            </div>
          )}
        </div>

        {/* 4-Octave Visual Keyboard Map */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 mb-2">
            <span>
              Mappa Estensione 4 Ottave (Mi2 – Do6) — Clicca qualsiasi tasto per ascoltare la
              frequenza:
            </span>
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="text-sky-400">■ Tua Tessitura ({semitoneSpan} semitoni)</span>
              <span className="text-amber-400">▲ Zona di Passaggio</span>
            </div>
          </div>

          <div className="grid grid-cols-9 sm:grid-cols-15 gap-1 bg-slate-950 p-3 rounded-xl border border-slate-800">
            {allRangeMidis.map((m) => {
              const info = formatMidiNote(m);
              const inUserRange = m >= lowMidi && m <= highMidi;
              const isBoundary = m === lowMidi || m === highMidi;
              const isPassaggio = m === passaggioPrimo || m === passaggioSecondo;

              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => studioAudio.playPianoNote(m, 0.85, 0.4)}
                  className={`py-2 px-1 rounded text-center font-mono transition-colors ${
                    isBoundary
                      ? "bg-sky-500 text-slate-950 font-bold"
                      : isPassaggio
                      ? "bg-amber-500/30 border border-amber-400 text-amber-200"
                      : inUserRange
                      ? "bg-sky-950/90 border border-sky-500/40 text-sky-200 hover:bg-sky-900"
                      : "bg-slate-900/60 border border-slate-800/70 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <div className="text-[10px] leading-tight">{info.noteIt}</div>
                  <div className="text-[8px] opacity-75">{info.noteIntl}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Summary & Passaggio Deck (4 cols) */}
      <div className="lg:col-span-4 flex flex-col gap-5">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold">
            <Compass className="w-4 h-4" />
            <span>Parametri biometrico-musicali</span>
          </div>

          <div className="grid grid-cols-2 gap-3 font-mono tabular-nums">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">Estensione Totale</div>
              <div className="text-lg font-semibold text-slate-100 mt-0.5">
                {octaveSpan} Ottave
              </div>
              <div className="text-[11px] text-sky-400">{semitoneSpan} semitoni</div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">Registro Affine</div>
              <div className="text-lg font-semibold text-emerald-400 mt-0.5">
                {matchedRegister.name}
              </div>
              <div className="text-[11px] text-slate-400">{matchedRegister.rangeLabel}</div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">1° Passaggio (Petto→Mix)</div>
              <div className="text-base font-semibold text-amber-300 mt-0.5">
                {formatMidiNote(passaggioPrimo).fullLabel}
              </div>
              <div className="text-[11px] text-slate-400">
                {formatMidiNote(passaggioPrimo).freq.toFixed(0)} Hz
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">2° Passaggio (Mix→Testa)</div>
              <div className="text-base font-semibold text-amber-300 mt-0.5">
                {formatMidiNote(passaggioSecondo).fullLabel}
              </div>
              <div className="text-[11px] text-slate-400">
                {formatMidiNote(passaggioSecondo).freq.toFixed(0)} Hz
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3">
            <div className="text-xs font-semibold text-slate-200 mb-2">
              Confronto con le Classificazioni Classiche
            </div>
            <div className="flex flex-col gap-2">
              {VOICE_REGISTERS.map((reg) => {
                const isMatch = reg.id === matchedRegister.id;
                const isSelected = reg.id === selectedRegisterId;
                return (
                  <div
                    key={reg.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                      isMatch
                        ? "bg-emerald-950/40 border-emerald-500/40 text-slate-100"
                        : "bg-slate-950/50 border-slate-800/80 text-slate-400"
                    }`}
                  >
                    <div>
                      <span className="font-semibold text-slate-200">{reg.name}</span>
                      <span className="mx-1.5 text-slate-600">·</span>
                      <span className="font-mono text-[11px]">{reg.rangeLabel}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onApplyRegister(
                          reg.id,
                          formatMidiNote(lowMidi).noteIt,
                          formatMidiNote(highMidi).noteIt
                        )
                      }
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                        isSelected
                          ? "bg-sky-500 text-slate-950 font-semibold"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                      }`}
                    >
                      {isSelected ? "Attivo" : "Seleziona"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
