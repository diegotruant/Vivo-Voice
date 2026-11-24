import React, { useState, useEffect, useRef } from "react";
import { coachFetch } from "../utils/aiSettings";
import {
  Play,
  Square,
  RotateCcw,
  Wind,
  Volume2,
  Mic,
  MicOff,
  Headphones,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { studioAudio } from "../utils/audioEngine";
import { AiFallbackNotice } from "./AiFallbackNotice";

interface BreathPreset {
  id: string;
  name: string;
  inhaleSec: number;
  suspendSec: number;
  exhaleSec: number;
  recoverSec: number;
  description: string;
  coachSpeech: string;
}

const BREATH_PRESETS: BreathPreset[] = [
  {
    id: "base-appoggio",
    name: "01. Fondamenta dell'Appoggio (4-2-8-2)",
    inhaleSec: 4,
    suspendSec: 2,
    exhaleSec: 8,
    recoverSec: 2,
    description:
      "Ideale per prendere coscienza dell'apertura intercostale e della discesa morbida del diaframma.",
    coachSpeech:
      "Mettiamoci in postura nobile: piedi ben piantati, sterno alto ma spalle rilassate. Appoggia le mani sui fianchi bassi: quando inspiri per 4 secondi devi sentire le costole allargarsi lateralmente sotto le mani. Poi emetti una S continua per 8 secondi senza far crollare il petto.",
  },
  {
    id: "sostenuto-fraseggio",
    name: "02. Sostenuto Lirico & Frasi Lunghe (4-3-14-3)",
    inhaleSec: 4,
    suspendSec: 3,
    exhaleSec: 14,
    recoverSec: 3,
    description:
      "Allena la resistenza dei muscoli intercostali esterni a non collassare durante le frasi musicali estese.",
    coachSpeech:
      "In questo esercizio alleniamo la differenza tra appoggio e sostegno. Nei 3 secondi di sospensione non chiudere la gola: tieni le costole aperte. Durante i 14 secondi di sibilante, usa i muscoli addominali bassi per accompagnare il fiato con pressione identica dall'inizio alla fine.",
  },
  {
    id: "presa-rapida",
    name: "03. Presa di Fiato Veloce (Catch Breath 2-1-12-2)",
    inhaleSec: 2,
    suspendSec: 1,
    exhaleSec: 12,
    recoverSec: 2,
    description:
      "Simula i respiri rapidi tra due incisi ritmici mantenendo intatta la colonna d'aria.",
    coachSpeech:
      "Quando canti una canzone non hai sempre 4 secondi per respirare. Qui impariamo il respiro rapido e silenzioso in 2 secondi: immagina di sorprenderti aprendo istantaneamente le costole basse, poi sostieni il suono per 12 secondi.",
  },
];

interface BreathingTrainerProps {
  onPlayCoachVoice?: (text: string) => void;
  isPlayingTts?: boolean;
}

export const BreathingTrainer: React.FC<BreathingTrainerProps> = ({
  onPlayCoachVoice,
  isPlayingTts = false,
}) => {
  const [inhaleSec, setInhaleSec] = useState<number>(4);
  const [suspendSec, setSuspendSec] = useState<number>(2);
  const [exhaleSec, setExhaleSec] = useState<number>(8);
  const [recoverSec, setRecoverSec] = useState<number>(2);
  const [metronomeSound, setMetronomeSound] = useState<boolean>(true);
  const [activePreset, setActivePreset] = useState<BreathPreset>(BREATH_PRESETS[0]);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [cycleCount, setCycleCount] = useState<number>(1);
  const [elapsedInCycle, setElapsedInCycle] = useState<number>(0);

  // Real-time Microphone "SSS" Hiss Steadiness Coach
  const [micHissActive, setMicHissActive] = useState<boolean>(false);
  const [hissAirflowLevel, setHissAirflowLevel] = useState<number>(0); // 0 to 100
  // Steadiness of the "SSS" airflow, measured only during the exhale phase (null = not measured yet)
  const [hissSteadiness, setHissSteadiness] = useState<number | null>(null);
  const [measuredExhales, setMeasuredExhales] = useState<number>(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [coachBreathEvaluation, setCoachBreathEvaluation] = useState<{
    feedbackMaestro: string;
    correzioneTecnica: string;
    prossimoPasso?: string;
    fraseVocaleCoach: string;
    isFallback?: boolean;
  } | null>(null);
  const [isAskingCoach, setIsAskingCoach] = useState<boolean>(false);

  const lastSecondTickRef = useRef<number>(-1);
  const startMsRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micPendingRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);
  // Total seconds elapsed in the guided session (kept across pause/resume)
  const totalElapsedRef = useRef<number>(0);
  // Current timer position, read by the microphone loop to know when we are in the exhale phase
  const phaseClockRef = useRef<{ running: boolean; inCycle: number; cycleIndex: number }>({
    running: false,
    inCycle: 0,
    cycleIndex: 1,
  });
  // Airflow levels collected during the current exhale window
  const exhaleSamplesRef = useRef<{ cycleIndex: number; levels: number[] }>({
    cycleIndex: -1,
    levels: [],
  });

  const totalCycleSec = inhaleSec + suspendSec + exhaleSec + recoverSec;

  const releaseMic = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  // Toggle Microphone Hiss Coach
  const toggleMicHissCoach = async () => {
    if (micPendingRef.current) return;
    if (micHissActive) {
      releaseMic();
      setMicHissActive(false);
      setHissAirflowLevel(0);
      return;
    }
    micPendingRef.current = true;
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      analyserRef.current = analyser;
      exhaleSamplesRef.current = { cycleIndex: -1, levels: [] };
      setHissSteadiness(null);
      setMeasuredExhales(0);
      setMicHissActive(true);
    } catch (err) {
      releaseMic();
      setMicHissActive(false);
      const name = (err as { name?: string })?.name;
      setMicError(
        name === "NotAllowedError"
          ? "Accesso al microfono negato: abilitalo nelle impostazioni del browser per misurare la sibilante."
          : name === "NotFoundError"
            ? "Nessun microfono trovato: collega un microfono e riprova."
            : "Impossibile attivare il microfono."
      );
    } finally {
      micPendingRef.current = false;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releaseMic();
    };
  }, []);

  // Measure Microphone RMS during emission for "SSS" steadiness coaching
  useEffect(() => {
    if (!micHissActive) return;
    let rafId: number;
    const buf = new Float32Array(1024);

    const monitorAirflow = () => {
      if (analyserRef.current) {
        analyserRef.current.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          sum += buf[i] * buf[i];
        }
        const rms = Math.sqrt(sum / buf.length);
        const level = Math.min(100, Math.round(rms * 420));
        setHissAirflowLevel(level);

        // Collect samples only inside the exhale phase, trimming 0.5 s of attack and release.
        // Every frame in the window counts (dropouts included), so an interrupted hiss scores low.
        const clock = phaseClockRef.current;
        const exhaleStart = inhaleSec + suspendSec + 0.5;
        const exhaleEnd = inhaleSec + suspendSec + exhaleSec - 0.5;
        const inExhaleWindow =
          clock.running && clock.inCycle >= exhaleStart && clock.inCycle <= exhaleEnd;
        const bucket = exhaleSamplesRef.current;
        if (inExhaleWindow) {
          if (bucket.cycleIndex !== clock.cycleIndex) {
            exhaleSamplesRef.current = { cycleIndex: clock.cycleIndex, levels: [] };
          }
          const levels = exhaleSamplesRef.current.levels;
          levels.push(level);
          if (levels.length >= 30 && levels.length % 6 === 0) {
            const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
            if (mean > 8) {
              const std = Math.sqrt(
                levels.reduce((a, b) => a + (b - mean) ** 2, 0) / levels.length
              );
              // Coefficient of variation → steadiness (100 = perfectly constant airflow)
              setHissSteadiness(Math.max(0, Math.round(100 * (1 - std / mean))));
            }
          }
        } else if (bucket.cycleIndex !== -1 && bucket.levels.length >= 30) {
          // Exhale window just ended: count it as measured if the user was actually hissing
          const mean = bucket.levels.reduce((a, b) => a + b, 0) / bucket.levels.length;
          if (mean > 8) setMeasuredExhales((n) => n + 1);
          exhaleSamplesRef.current = { cycleIndex: -1, levels: [] };
        }
      }
      rafId = requestAnimationFrame(monitorAirflow);
    };
    rafId = requestAnimationFrame(monitorAirflow);
    return () => cancelAnimationFrame(rafId);
  }, [micHissActive, inhaleSec, suspendSec, exhaleSec]);

  const resetCycleClock = () => {
    totalElapsedRef.current = 0;
    lastSecondTickRef.current = -1;
    phaseClockRef.current = { running: false, inCycle: 0, cycleIndex: 1 };
    exhaleSamplesRef.current = { cycleIndex: -1, levels: [] };
    setElapsedInCycle(0);
    setCycleCount(1);
  };

  // Changing a phase duration restarts the cycle from the beginning
  useEffect(() => {
    resetCycleClock();
  }, [inhaleSec, suspendSec, exhaleSec, recoverSec]);

  useEffect(() => {
    if (!isRunning) return;
    let rafId: number;
    startMsRef.current = performance.now() - totalElapsedRef.current * 1000;

    const tick = (now: number) => {
      const totalElapsed = Math.max(0, (now - startMsRef.current) / 1000);
      totalElapsedRef.current = totalElapsed;
      const cycleIndex = Math.floor(totalElapsed / totalCycleSec) + 1;
      const inCycle = totalElapsed % totalCycleSec;
      phaseClockRef.current = { running: true, inCycle, cycleIndex };

      setCycleCount(cycleIndex);
      setElapsedInCycle(inCycle);

      const wholeSec = Math.floor(totalElapsed);
      if (wholeSec !== lastSecondTickRef.current) {
        lastSecondTickRef.current = wholeSec;
        if (metronomeSound) {
          const isPhaseBoundary =
            Math.floor(inCycle) === 0 ||
            Math.floor(inCycle) === inhaleSec ||
            Math.floor(inCycle) === inhaleSec + suspendSec ||
            Math.floor(inCycle) === inhaleSec + suspendSec + exhaleSec;
          studioAudio.playMetronomeTick(isPhaseBoundary, 0.16);
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      phaseClockRef.current = { ...phaseClockRef.current, running: false };
    };
  }, [isRunning, totalCycleSec, inhaleSec, suspendSec, exhaleSec, metronomeSound]);

  const requestBreathingCoachFeedback = async () => {
    setIsAskingCoach(true);
    const completedCycles = Math.floor(totalElapsedRef.current / totalCycleSec);
    const measured = micHissActive || measuredExhales > 0 ? hissSteadiness : null;
    const details =
      measured === null
        ? `Microfono non attivo: stabilità non misurata. Cicli completati: ${completedCycles}.`
        : `Stabilità del flusso d'aria misurata sulla sibilante durante la fase di emissione: ${measured}% (fasi di emissione misurate: ${measuredExhales}). Cicli completati: ${completedCycles}.`;
    try {
      const res = await coachFetch("/api/vocal-coach/lesson-coach", {
          moduleType: "Respirazione Costo-Diaframmatica & Appoggio",
          exerciseName: `Ciclo ${inhaleSec}s Inspirazione - ${suspendSec}s Appoggio - ${exhaleSec}s Emissione SSS`,
          scorePercent: measured ?? "non misurato",
          details,
        });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCoachBreathEvaluation(data);
    } catch (e) {
      console.error("Failed to fetch breathing coach feedback:", e);
    } finally {
      setIsAskingCoach(false);
    }
  };

  // Determine current phase and active Coach prompt
  const getPhaseData = () => {
    const t = elapsedInCycle;
    if (t < inhaleSec) {
      const progress = t / inhaleSec;
      return {
        phaseId: "inhale",
        phaseTitle: "1. Inspirazione Costo-Diaframmatica",
        badge: "● INSPIRAZIONE SILENZIOSA",
        badgeClass: "text-sky-300 border-sky-500/40 bg-sky-950/60",
        coachDirectPrompt:
          "Il Coach dice: «Mani sulle costole basse! Inspira dal naso e dalla bocca come se annusassi un fiore. Senti i fianchi allargarsi lateralmente, non alzare le spalle!»",
        remainingSec: Math.ceil(inhaleSec - t),
        expansion: progress,
        subglotticPressure: Math.round(progress * 65),
      };
    }
    if (t < inhaleSec + suspendSec) {
      return {
        phaseId: "suspend",
        phaseTitle: "2. Sospensione Elastica (Impostazione Appoggio)",
        badge: "▲ APPOGGIO ATTIVO",
        badgeClass: "text-amber-300 border-amber-500/40 bg-amber-950/60",
        coachDirectPrompt:
          "Il Coach dice: «Fermo così! Mantieni le costole larghe ma lascia la gola completamente aperta (non bloccare il fiato con la glottide). Questo è il vero Appoggio.»",
        remainingSec: Math.ceil(inhaleSec + suspendSec - t),
        expansion: 1.0,
        subglotticPressure: 85,
      };
    }
    if (t < inhaleSec + suspendSec + exhaleSec) {
      const progress = (t - (inhaleSec + suspendSec)) / exhaleSec;
      return {
        phaseId: "exhale",
        phaseTitle: "3. Emissione a Pressione Costante (Sibilante 'SSS')",
        badge: "● SOSTEGNO VOCALE COSTANTE",
        badgeClass: "text-emerald-300 border-emerald-500/40 bg-emerald-950/60",
        coachDirectPrompt:
          "Il Coach dice: «Fai 'SSSSS' tra gli incisivi! Resisti con i fianchi: non lasciare che la gabbia toracica si sgonfi di colpo nei primi 3 secondi. Flusso identico fino alla fine!»",
        remainingSec: Math.ceil(inhaleSec + suspendSec + exhaleSec - t),
        expansion: 1.0 - progress * 0.85,
        subglotticPressure: 90,
      };
    }
    const progress = (t - (inhaleSec + suspendSec + exhaleSec)) / recoverSec;
    return {
      phaseId: "recover",
      phaseTitle: "4. Rilascio Elastico e Decompressione",
      badge: "○ RECUPERO MUSCOLARE",
      badgeClass: "text-slate-300 border-slate-600 bg-slate-800/70",
      coachDirectPrompt:
        "Il Coach dice: «Molto bene. Rilascia completamente la pancia, il collo e la mandibola prima di iniziare il prossimo respiro.»",
      remainingSec: Math.ceil(totalCycleSec - t),
      expansion: 0.15 * (1 - progress),
      subglotticPressure: Math.round(15 * (1 - progress)),
    };
  };

  const phase = getPhaseData();
  const domeControlY = 148 + phase.expansion * 46;
  const ribSpreadPx = phase.expansion * 22;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Voice Coaching Guidance Banner */}
      <div className="bg-slate-900/95 border border-sky-500/30 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="max-w-3xl">
          <div className="text-xs text-sky-400 font-semibold">
            Guida Pratica del Vocal Coach · Come Respirare nel Canto
          </div>
          <h2 className="text-lg font-semibold text-slate-100 mt-0.5">
            {activePreset.name}
          </h2>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            {activePreset.coachSpeech}
          </p>
        </div>

        {onPlayCoachVoice && (
          <button
            type="button"
            onClick={() => onPlayCoachVoice(activePreset.coachSpeech)}
            disabled={isPlayingTts}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors whitespace-nowrap shrink-0"
          >
            <Headphones className="w-4 h-4" />
            <span>
              {isPlayingTts ? "Voce del Coach attiva..." : "Ascolta Istruzioni del Coach"}
            </span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Interactive Physiological Simulator & Live Coach Prompts (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-xl p-6 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="text-xs text-slate-400">
                Biomeccanica del Canto · Appoggio & Sostegno Costo-Diaframmatico
              </div>
              <h3 className="text-xl font-semibold text-slate-100 mt-0.5">
                Coach Respiratorio & Verifica Sibilante &ldquo;SSS&rdquo;
              </h3>
            </div>

            <span
              className={`text-xs font-mono font-semibold px-2.5 py-1 rounded border ${phase.badgeClass}`}
            >
              {phase.badge}
            </span>
          </div>

          {/* Interactive Anatomical SVG Stage */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center bg-[#0B1120] border border-slate-800 rounded-xl p-5">
            <div className="md:col-span-7 flex justify-center">
              <svg
                viewBox="0 0 320 260"
                className="w-full max-w-[320px] h-auto select-none"
                role="img"
                aria-label="Diagramma dinamico dell'espansione polmonare e discesa del diaframma"
              >
                <line x1="160" y1="15" x2="160" y2="245" stroke="#1E293B" strokeDasharray="3 3" />
                <line x1="30" y1="170" x2="290" y2="170" stroke="#1E293B" strokeDasharray="3 3" />

                <path
                  d="M 152 20 L 152 72 M 168 20 L 168 72"
                  stroke="#64748B"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                {isRunning && (
                  <circle
                    cx="160"
                    cy={
                      phase.phaseId === "inhale"
                        ? 25 + phase.expansion * 45
                        : phase.phaseId === "exhale"
                        ? 25 + phase.expansion * 45
                        : 55
                    }
                    r="5"
                    fill={phase.phaseId === "exhale" ? "#10B981" : "#38BDF8"}
                  />
                )}

                <path
                  d={`M 145 65 C ${85 - ribSpreadPx} 75, ${62 - ribSpreadPx} 135, ${
                    75 - ribSpreadPx
                  } ${178 + phase.expansion * 16} L 150 ${domeControlY - 12} Z`}
                  fill="rgba(2, 132, 199, 0.18)"
                  stroke="#38BDF8"
                  strokeWidth="2"
                />
                <path
                  d={`M 175 65 C ${235 + ribSpreadPx} 75, ${258 + ribSpreadPx} 135, ${
                    245 + ribSpreadPx
                  } ${178 + phase.expansion * 16} L 170 ${domeControlY - 12} Z`}
                  fill="rgba(2, 132, 199, 0.18)"
                  stroke="#38BDF8"
                  strokeWidth="2"
                />

                <path
                  d={`M ${68 - ribSpreadPx} 186 Q 160 ${domeControlY - 40} ${
                    252 + ribSpreadPx
                  } 186`}
                  fill="none"
                  stroke={phase.phaseId === "exhale" ? "#10B981" : "#F59E0B"}
                  strokeWidth="5"
                  strokeLinecap="round"
                />

                <text x="22" y="135" fill="#94A3B8" fontSize="10" fontFamily="IBM Plex Mono">
                  ← Costole
                </text>
                <text x="248" y="135" fill="#94A3B8" fontSize="10" fontFamily="IBM Plex Mono">
                  Costole →
                </text>
                <text
                  x="160"
                  y="235"
                  textAnchor="middle"
                  fill="#F59E0B"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="IBM Plex Mono"
                >
                  Cupola Diaframmatica (modello illustrativo)
                </text>
              </svg>
            </div>

            <div className="md:col-span-5 flex flex-col gap-3">
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5">
                <div className="text-xs text-slate-400">Fase Attiva (Ciclo #{cycleCount})</div>
                <div className="text-sm font-semibold text-slate-100 mt-0.5">
                  {phase.phaseTitle}
                </div>
                <div className="text-2xl font-bold text-sky-400 font-mono tabular-nums mt-1.5">
                  {phase.remainingSec}s rimanenti
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 font-mono tabular-nums">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Apertura Intercostale (modello)</span>
                  <span className="text-sky-400 font-semibold">
                    {Math.round(phase.expansion * 100)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="h-full bg-sky-500 transition-transform duration-75 origin-left"
                    style={{ transform: `scaleX(${Math.max(0.05, phase.expansion)})` }}
                  />
                </div>

                <div className="flex justify-between text-xs text-slate-400 mt-3">
                  <span>Pressione Sottoglottica (indice relativo, modello)</span>
                  <span className="text-emerald-400 font-semibold">
                    {phase.subglotticPressure}/100
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="h-full bg-emerald-500 transition-transform duration-75 origin-left"
                    style={{
                      transform: `scaleX(${Math.max(0.05, phase.subglotticPressure / 100)})`,
                    }}
                  />
                </div>
              </div>

              <p className="text-[10px] text-slate-500 leading-snug">
                Valori del modello animato che guida il ritmo: non sono misurati dal microfono.
              </p>

              <p className="text-xs text-emerald-200 leading-relaxed bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-3">
                {phase.coachDirectPrompt}
              </p>
            </div>
          </div>

          {/* Live Microphone "SSS" Hiss Steadiness Detector */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-slate-200">
                  Verifica col Microfono: Esercizio della Sibilante &ldquo;SSSSS&rdquo;
                </div>
                <p className="text-[11px] text-slate-400">
                  Attiva il microfono durante la fase di Emissione e soffia una &ldquo;S&rdquo;
                  continua: il Coach misura se il flusso d&apos;aria trema o resta costante.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleMicHissCoach}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  micHissActive
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                }`}
              >
                {micHissActive ? (
                  <>
                    <Mic className="w-3.5 h-3.5" />
                    <span>
                      Microfono Sibilante Attivo (Stabilità:{" "}
                      {hissSteadiness === null ? "non misurata" : `${hissSteadiness}%`})
                    </span>
                  </>
                ) : (
                  <>
                    <MicOff className="w-3.5 h-3.5" />
                    <span>Misura la tua &ldquo;SSS&rdquo; col Microfono</span>
                  </>
                )}
              </button>
            </div>

            {micError && <p className="text-[11px] text-rose-400">{micError}</p>}

            {micHissActive && (
              <div className="flex flex-col gap-1.5 font-mono text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Livello Flusso Sibilante (microfono): {hissAirflowLevel}%</span>
                  {hissSteadiness === null ? (
                    <span className="text-slate-500">
                      {isRunning
                        ? "○ In attesa della fase di emissione…"
                        : "○ Avvia l'allenamento: si misura durante l'emissione"}
                    </span>
                  ) : (
                    <span
                      className={
                        hissSteadiness >= 85 ? "text-emerald-400" : "text-amber-400"
                      }
                    >
                      {hissSteadiness >= 85
                        ? `● FLUSSO OMOGENEO (${hissSteadiness}%)`
                        : `▲ FLUSSO OSCILLANTE (${hissSteadiness}%)`}
                    </span>
                  )}
                </div>
                <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-emerald-400 transition-transform duration-75 origin-left"
                    style={{
                      transform: `scaleX(${Math.max(0.03, hissAirflowLevel / 100)})`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Transport Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsRunning((prev) => !prev)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  isRunning
                    ? "bg-rose-600 hover:bg-rose-500 text-white"
                    : "bg-sky-500 hover:bg-sky-400 text-slate-950"
                }`}
              >
                {isRunning ? (
                  <>
                    <Square className="w-4 h-4 fill-current" />
                    <span>Pausa Ciclo</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Avvia Allenamento Guidato</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsRunning(false);
                  resetCycleClock();
                }}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Azzera</span>
              </button>

              <button
                type="button"
                onClick={() => setMetronomeSound((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  metronomeSound
                    ? "bg-slate-800 border-sky-500/40 text-sky-300"
                    : "bg-slate-950 border-slate-800 text-slate-400"
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Battito: {metronomeSound ? "On" : "Off"}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={requestBreathingCoachFeedback}
              disabled={isAskingCoach}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {isAskingCoach ? "Analisi..." : "Ricevi Feedback dal Coach"}
              </span>
            </button>
          </div>

          {coachBreathEvaluation && (
            <div className="bg-slate-950 border border-emerald-500/40 rounded-xl p-4 flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Valutazione del Maestro sulla Respirazione</span>
                </div>
                {onPlayCoachVoice && (
                  <button
                    type="button"
                    onClick={() =>
                      onPlayCoachVoice(coachBreathEvaluation.fraseVocaleCoach)
                    }
                    disabled={isPlayingTts}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-sky-500 text-slate-950"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    <span>Ascolta Voce</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                {coachBreathEvaluation.feedbackMaestro}
              </p>
              <AiFallbackNotice show={coachBreathEvaluation.isFallback} />
              <p className="text-xs text-sky-300 leading-relaxed">
                <span className="font-semibold">Correzione Posturale: </span>
                {coachBreathEvaluation.correzioneTecnica}
              </p>
              {coachBreathEvaluation.prossimoPasso && (
                <p className="text-xs text-emerald-300 leading-relaxed">
                  <span className="font-semibold">Prossimo Passo: </span>
                  {coachBreathEvaluation.prossimoPasso}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right Control Deck (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold">
              <Wind className="w-4 h-4" />
              <span>Durata Fasi Respiratorie (Secondi)</span>
            </div>

            <div className="flex flex-col gap-3.5">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium">
                    1. Inspirazione Costo-Diaframmatica
                  </span>
                  <span className="font-mono tabular-nums text-sky-400 font-semibold">
                    {inhaleSec} secondi
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={8}
                  step={1}
                  value={inhaleSec}
                  onChange={(e) => setInhaleSec(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium">
                    2. Sospensione & Impostazione Appoggio
                  </span>
                  <span className="font-mono tabular-nums text-amber-400 font-semibold">
                    {suspendSec} secondi
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={1}
                  value={suspendSec}
                  onChange={(e) => setSuspendSec(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium">
                    3. Emissione Controllata (Sibilante &lsquo;SSS&rsquo;)
                  </span>
                  <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                    {exhaleSec} secondi
                  </span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={24}
                  step={1}
                  value={exhaleSec}
                  onChange={(e) => setExhaleSec(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium">4. Rilascio e Recupero</span>
                  <span className="font-mono tabular-nums text-slate-300 font-semibold">
                    {recoverSec} secondi
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={1}
                  value={recoverSec}
                  onChange={(e) => setRecoverSec(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4 flex flex-col gap-2">
              <div className="text-xs font-semibold text-slate-200 mb-1">
                Lezioni di Respirazione col Maestro (clicca per attivare):
              </div>
              {BREATH_PRESETS.map((preset) => {
                const isSelected = preset.id === activePreset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setActivePreset(preset);
                      setInhaleSec(preset.inhaleSec);
                      setSuspendSec(preset.suspendSec);
                      setExhaleSec(preset.exhaleSec);
                      setRecoverSec(preset.recoverSec);
                      resetCycleClock();
                    }}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? "bg-slate-950 border-sky-500 text-slate-100"
                        : "bg-slate-950/70 border-slate-800 hover:border-sky-500/50 text-slate-300"
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-100">
                      {preset.name}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
