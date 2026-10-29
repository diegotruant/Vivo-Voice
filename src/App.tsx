/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip as RechartsTooltip,
} from "recharts";
import { PitchStudio } from "./components/PitchStudio";
import { VocalRangeFinder } from "./components/VocalRangeFinder";
import { BreathingTrainer } from "./components/BreathingTrainer";
import { WarmupCoach } from "./components/WarmupCoach";
import { SolfeggioCoach } from "./components/SolfeggioCoach";
import { AnatomyFormantLab } from "./components/AnatomyFormantLab";
import { VocalProgressSection } from "./components/VocalProgressSection";
import { SongStudioDaw } from "./components/SongStudioDaw";
import {
  VoiceRegisterId,
  AiAnalysisResult,
  VocalSessionRecord,
} from "./types/vocal";
import {
  VOICE_REGISTERS,
  VOCAL_EXERCISES,
} from "./utils/audioEngine";

type StudioTab =
  | "diaframma"
  | "riscaldamento"
  | "solfeggio"
  | "palestra"
  | "studio-brani"
  | "estensione"
  | "risonanza"
  | "progressi";

const INITIAL_PROGRESS_SESSIONS: VocalSessionRecord[] = [
  {
    id: "sess-1",
    dateLabel: "14 Ott",
    fullDate: "2026-10-14",
    exerciseTitle: "Sostenuto & Appoggio Diaframmatico",
    category: "Stabilità & Fiato",
    registerName: "Tenore",
    accuracyPercent: 68,
    stabilityPercent: 71,
    avgCentsDeviation: -14,
    durationMin: 12,
    coachNote:
      "Tendenza lievemente calante nei finali di frase; iniziare ad espandere le costole inferiori.",
  },
  {
    id: "sess-2",
    dateLabel: "17 Ott",
    fullDate: "2026-10-17",
    exerciseTitle: "Solfeggio Cantato per Gradi Congiunti",
    category: "Solfeggio & Orecchio",
    registerName: "Tenore",
    accuracyPercent: 75,
    stabilityPercent: 78,
    avgCentsDeviation: -8,
    durationMin: 15,
    coachNote:
      "Buona lettura sul pentagramma e presa di fiato sul quarto movimento in levare.",
  },
  {
    id: "sess-3",
    dateLabel: "20 Ott",
    fullDate: "2026-10-20",
    exerciseTitle: "Scala di Quinta Legato (1-2-3-4-5-4-3-2-1)",
    category: "Legato & Omogeneità",
    registerName: "Tenore",
    accuracyPercent: 79,
    stabilityPercent: 82,
    avgCentsDeviation: -6,
    durationMin: 18,
    coachNote:
      "Passaggi per gradi congiunti più fluidi e laringe più stabile sul 5° grado.",
  },
  {
    id: "sess-4",
    dateLabel: "23 Ott",
    fullDate: "2026-10-23",
    exerciseTitle: "Ponte sul Passaggio & Voce Mista (1-5-8-5-1)",
    category: "Passaggio di Registro",
    registerName: "Tenore",
    accuracyPercent: 84,
    stabilityPercent: 85,
    avgCentsDeviation: 4,
    durationMin: 16,
    coachNote:
      "Buon alleggerimento della massa vocale sull'ottava con vocale stretta 'U'.",
  },
  {
    id: "sess-5",
    dateLabel: "26 Ott",
    fullDate: "2026-10-26",
    exerciseTitle: "Triade Maggiore in Maschera (1-3-5-3-1)",
    category: "Intonazione & Risonanza",
    registerName: "Tenore",
    accuracyPercent: 88,
    stabilityPercent: 89,
    avgCentsDeviation: -3,
    durationMin: 20,
    coachNote:
      "Intonazione ben centrata nel corridoio armonico (±15 cent) e ottimo sostegno.",
  },
  {
    id: "sess-6",
    dateLabel: "Oggi",
    fullDate: "2026-10-28",
    exerciseTitle: "Agilità Belcantistica & Fioritura",
    category: "Agilità & Controllo",
    registerName: "Tenore",
    accuracyPercent: 91,
    stabilityPercent: 90,
    avgCentsDeviation: -2,
    durationMin: 18,
    coachNote:
      "Ottima precisione glottica nei gradi rapidi mantenendo il torace nobile e aperto.",
  },
];

const STORAGE_KEY = "voceviva_progress_sessions_v1";

export default function App() {
  const [activeTab, setActiveTab] = useState<StudioTab>("riscaldamento");
  const [selectedRegisterId, setSelectedRegisterId] =
    useState<VoiceRegisterId>("tenore");
  const [lowNoteLabel, setLowNoteLabel] = useState<string>("Do3");
  const [highNoteLabel, setHighNoteLabel] = useState<string>("Do5");
  const [recentAccuracy, setRecentAccuracy] = useState<number>(91);
  const [lastAnalysis, setLastAnalysis] = useState<AiAnalysisResult | null>(
    null
  );
  const [lastExerciseTitle, setLastExerciseTitle] = useState<string>(
    "Sostenuto & Appoggio Diaframmatico"
  );
  const [isPlayingTts, setIsPlayingTts] = useState<boolean>(false);

  const [sessions, setSessions] = useState<VocalSessionRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage error
    }
    return INITIAL_PROGRESS_SESSIONS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // ignore storage error
    }
  }, [sessions]);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const currentRegister =
    VOICE_REGISTERS.find((r) => r.id === selectedRegisterId) ||
    VOICE_REGISTERS[2];

  const handleSaveAnalysis = useCallback(
    (
      analysis: AiAnalysisResult,
      accuracy: number,
      exerciseTitle: string,
      stability: number,
      avgCents: number,
      category: string
    ) => {
      setLastAnalysis(analysis);
      setRecentAccuracy(accuracy);
      setLastExerciseTitle(exerciseTitle);

      const now = new Date();
      const timeLabel = now.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const newRecord: VocalSessionRecord = {
        id: `sess-${Date.now()}`,
        dateLabel: `Oggi ${timeLabel}`,
        fullDate: now.toISOString().slice(0, 10),
        exerciseTitle,
        category,
        registerName: currentRegister.name,
        accuracyPercent: accuracy,
        stabilityPercent: stability,
        avgCentsDeviation: avgCents,
        durationMin: 10,
        coachNote: analysis.valutazioneSintetica,
      };

      setSessions((prev) => [...prev, newRecord]);
    },
    [currentRegister.name]
  );

  const handleAddSimulatedSession = useCallback(() => {
    const randomEx =
      VOCAL_EXERCISES[Math.floor(Math.random() * VOCAL_EXERCISES.length)];
    const lastAcc =
      sessions.length > 0
        ? sessions[sessions.length - 1].accuracyPercent
        : 82;
    const nextAcc = Math.max(
      72,
      Math.min(98, lastAcc + Math.floor(Math.random() * 6) - 1)
    );
    const nextStab = Math.max(
      75,
      Math.min(97, nextAcc + Math.floor(Math.random() * 5) - 2)
    );
    const nextCents = Math.floor(Math.random() * 9) - 4;
    const now = new Date();
    const timeLabel = now.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const newSession: VocalSessionRecord = {
      id: `sess-${Date.now()}`,
      dateLabel: `Sessione ${timeLabel}`,
      fullDate: now.toISOString().slice(0, 10),
      exerciseTitle: randomEx.title,
      category: randomEx.category,
      registerName: currentRegister.name,
      accuracyPercent: nextAcc,
      stabilityPercent: nextStab,
      avgCentsDeviation: nextCents,
      durationMin: 12,
      coachNote:
        "Esecuzione registrata: progressione costante della tenuta diaframmatica e centratura tonale.",
    };

    setSessions((prev) => [...prev, newSession]);
    setRecentAccuracy(nextAcc);
  }, [sessions, currentRegister.name]);

  const handleResetHistory = useCallback(() => {
    setSessions(INITIAL_PROGRESS_SESSIONS);
  }, []);

  const handleApplyRegisterFromFinder = useCallback(
    (id: VoiceRegisterId, lowLabel: string, highLabel: string) => {
      setSelectedRegisterId(id);
      setLowNoteLabel(lowLabel);
      setHighNoteLabel(highLabel);
      setActiveTab("palestra");
    },
    []
  );

  // Spoken Vocal Coach Playback via Server Gemini TTS (/api/vocal-coach/tts) with Web Speech fallback
  const handlePlayCoachVoice = useCallback(async (text: string) => {
    if (!text) return;
    setIsPlayingTts(true);

    try {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }

      const res = await fetch("/api/vocal-coach/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audioBase64) {
          const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
          audioPlayerRef.current = audio;
          audio.onended = () => setIsPlayingTts(false);
          audio.onerror = () => setIsPlayingTts(false);
          await audio.play();
          return;
        }
      }

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "it-IT";
        utter.rate = 0.98;
        utter.onend = () => setIsPlayingTts(false);
        utter.onerror = () => setIsPlayingTts(false);
        window.speechSynthesis.speak(utter);
      } else {
        setIsPlayingTts(false);
      }
    } catch {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "it-IT";
        utter.onend = () => setIsPlayingTts(false);
        utter.onerror = () => setIsPlayingTts(false);
        window.speechSynthesis.speak(utter);
      } else {
        setIsPlayingTts(false);
      }
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#0F172A] text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800 bg-slate-950/90 sticky top-0 z-30 backdrop-blur-md">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#riscaldamento"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab("riscaldamento");
          }}
          className="text-lg font-bold tracking-tight text-slate-100 font-display whitespace-nowrap shrink-0"
        >
          VoceViva Studio
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <a
            href="#diaframma"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("diaframma");
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === "diaframma"
                ? "text-slate-100 border-sky-400"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Respirazione
          </a>
          <a
            href="#riscaldamento"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("riscaldamento");
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === "riscaldamento"
                ? "text-slate-100 border-sky-400"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Riscaldamento
          </a>
          <a
            href="#solfeggio"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("solfeggio");
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === "solfeggio"
                ? "text-slate-100 border-sky-400"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Solfeggio Cantato
          </a>
          <a
            href="#palestra"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("palestra");
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === "palestra"
                ? "text-slate-100 border-sky-400"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Palestra Vocale
          </a>
          <a
            href="#studio-brani"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("studio-brani");
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === "studio-brani"
                ? "text-emerald-300 border-emerald-400"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Studio Brani & Mix AI
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              handlePlayCoachVoice(
                "Benvenuto alla tua lezione di canto. Iniziamo dal respiro diaframmatico e dal modulo di Riscaldamento con Vocal Fry e Lip Trill per preparare le corde vocali senza sforzo, prima di passare al Solfeggio Cantato e alla Palestra Vocale."
              );
            }}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 rounded-lg hover:bg-sky-300 transition-colors whitespace-nowrap shrink-0"
          >
            Ascolta Piano Lezione
          </button>
        </div>
      </header>

      {/* Main Content Container (1440px desktop baseline) */}
      <main className="flex-1 w-full max-w-[1380px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {/* Guided Vocal Coach Lesson Path Banner */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Percorso Didattico Guidato dal Vocal Coach</span>
                <span aria-hidden="true">·</span>
                <span>Registro: {currentRegister.name}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  Estensione: {lowNoteLabel} – {highNoteLabel}
                </span>
              </div>
              <h1
                className="text-xl sm:text-2xl font-bold text-slate-100 mt-0.5"
                style={{ textWrap: "balance" }}
              >
                Percorso Lezione: 1. Fiato → 2. Riscaldamento (Fry & Lip Trill) → 3. Solfeggio → 4. Palestra
              </h1>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab("diaframma")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === "diaframma"
                    ? "bg-sky-500 text-slate-950 font-semibold"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                01. Respirazione
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("riscaldamento")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === "riscaldamento"
                    ? "bg-sky-500 text-slate-950 font-semibold"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                02. Riscaldamento
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("solfeggio")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === "solfeggio"
                    ? "bg-sky-500 text-slate-950 font-semibold"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                03. Solfeggio Cantato
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("palestra")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === "palestra"
                    ? "bg-sky-500 text-slate-950 font-semibold"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                04. Palestra Vocale
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("studio-brani")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === "studio-brani"
                    ? "bg-emerald-500 text-slate-950 font-semibold"
                    : "text-emerald-300 hover:text-slate-100"
                }`}
              >
                05. Studio Brani MP3/WAV & Mix AI
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("estensione")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === "estensione"
                    ? "bg-sky-500 text-slate-950 font-semibold"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                06. Estensione
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("risonanza")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === "risonanza"
                    ? "bg-sky-500 text-slate-950 font-semibold"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                07. Risonanza & Spettro Live
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("progressi")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === "progressi"
                    ? "bg-sky-500 text-slate-950 font-semibold"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                08. Progressi ({recentAccuracy}%)
              </button>
            </div>
          </div>
        </section>

        {/* Active Interactive Workbench Module */}
        <section>
          {activeTab === "diaframma" && (
            <BreathingTrainer
              onPlayCoachVoice={handlePlayCoachVoice}
              isPlayingTts={isPlayingTts}
            />
          )}

          {activeTab === "riscaldamento" && (
            <WarmupCoach
              selectedRegisterId={selectedRegisterId}
              onPlayCoachVoice={handlePlayCoachVoice}
              isPlayingTts={isPlayingTts}
              onCompleteWarmupAndGoToStudio={() => setActiveTab("palestra")}
            />
          )}

          {activeTab === "solfeggio" && (
            <SolfeggioCoach
              selectedRegisterId={selectedRegisterId}
              onPlayCoachVoice={handlePlayCoachVoice}
              isPlayingTts={isPlayingTts}
            />
          )}

          {activeTab === "palestra" && (
            <PitchStudio
              selectedRegisterId={selectedRegisterId}
              onSelectRegister={setSelectedRegisterId}
              onSaveAnalysis={handleSaveAnalysis}
              onPlayCoachVoice={handlePlayCoachVoice}
              isPlayingTts={isPlayingTts}
            />
          )}

          {activeTab === "studio-brani" && (
            <SongStudioDaw
              selectedRegisterId={selectedRegisterId}
              onPlayCoachVoice={handlePlayCoachVoice}
              isPlayingTts={isPlayingTts}
              onNavigateToModule={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === "estensione" && (
            <VocalRangeFinder
              selectedRegisterId={selectedRegisterId}
              onApplyRegister={handleApplyRegisterFromFinder}
            />
          )}

          {activeTab === "risonanza" && (
            <AnatomyFormantLab
              selectedRegisterId={selectedRegisterId}
              lowNoteLabel={lowNoteLabel}
              highNoteLabel={highNoteLabel}
              recentAccuracy={recentAccuracy}
              lastAnalysis={lastAnalysis}
              lastExerciseTitle={lastExerciseTitle}
              onPlayCoachVoice={handlePlayCoachVoice}
              isPlayingTts={isPlayingTts}
            />
          )}

          {activeTab === "progressi" && (
            <VocalProgressSection
              sessions={sessions}
              onAddSimulatedSession={handleAddSimulatedSession}
              onResetHistory={handleResetHistory}
              onNavigateToStudio={() => setActiveTab("palestra")}
            />
          )}
        </section>
      </main>

      {/* Footer with Compact Recharts Accuracy Evolution Mini-View & Studio Links */}
      <footer className="border-t border-slate-800/80 px-6 py-5 mt-8 text-xs text-slate-400 max-w-[1380px] w-full mx-auto flex flex-col gap-4">
        {activeTab !== "progressi" && (
          <div className="bg-slate-900/70 border border-slate-800/90 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="max-w-md">
              <div className="text-xs font-semibold text-slate-200">
                Andamento Accuratezza Vocale ({sessions.length} sessioni registrate)
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Evoluzione da{" "}
                <span className="font-mono text-slate-200">
                  {sessions[0]?.accuracyPercent ?? 68}%
                </span>{" "}
                a{" "}
                <span className="font-mono text-emerald-400 font-semibold">
                  {sessions[sessions.length - 1]?.accuracyPercent ?? recentAccuracy}%
                </span>
                . Apri la vista completa per analizzare stabilità e deviazione in centesimi.
              </p>
            </div>

            <div className="w-full md:w-72 h-16">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sessions}>
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "#0F172A",
                      borderColor: "#334155",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontFamily: "IBM Plex Mono, monospace",
                    }}
                    formatter={(val: any) => [`${val}%`, "Accuratezza"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="accuracyPercent"
                    stroke="#38BDF8"
                    strokeWidth={2}
                    fill="#0284C7"
                    fillOpacity={0.22}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("progressi")}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 transition-colors whitespace-nowrap shrink-0"
            >
              Apri Sezione Progressi →
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 text-slate-500">
          <div>
            VoceViva Studio · Didattica del Belcanto, Solfeggio Cantato e Tecnica Moderna
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveTab("riscaldamento")}
              className="hover:text-slate-300 transition-colors"
            >
              Riscaldamento SOVTE
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveTab("solfeggio")}
              className="hover:text-slate-300 transition-colors"
            >
              Solfeggio Cantato
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveTab("palestra")}
              className="hover:text-slate-300 transition-colors"
            >
              Palestra Vocale
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveTab("progressi")}
              className="hover:text-slate-300 transition-colors"
            >
              Statistiche Progressi
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
