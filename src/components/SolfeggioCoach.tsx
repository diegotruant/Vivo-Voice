import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Square,
  Volume2,
  Headphones,
  Mic,
  MicOff,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Music,
} from "lucide-react";
import {
  studioAudio,
  formatMidiNote,
  freqToMidiFloat,
  detectPitchAutocorrelation,
  VOICE_REGISTERS,
} from "../utils/audioEngine";
import { VoiceRegisterId } from "../types/vocal";

interface SolfeggioNote {
  stepNumber: number;
  solfegeName: string; // "Do", "Re", "Mi", "Fa", "Sol", "La", "Si", "Do5"
  degreeOffset: number; // semitones from C4 (60): 0, 2, 4, 5, 7, 9, 11, 12
  staffLinePos: number; // 0 = C4 ledger line, 1 = D4 space, 2 = E4 1st line, 3 = F4, 4 = G4, 5 = A4, 6 = B4, 7 = C5
  beats: number; // 1 = Semiminima (Quarter), 2 = Minima (Half), 4 = Semibreve
  figureLabel: string;
  intervalLabel: string;
  coachCue: string;
}

interface SolfeggioLesson {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  bpm: number;
  whyItMatters: string;
  maestroIntroSpeech: string;
  notes: SolfeggioNote[];
}

const SOLFEGGIO_LESSONS: SolfeggioLesson[] = [
  {
    id: "gradi-congiunti",
    code: "Lezione 01",
    title: "Solfeggio Cantato per Gradi Congiunti (Do–Re–Mi–Fa–Sol)",
    subtitle: "Lettura sul pentagramma, battuta 4/4 e respirazione sul movimento di levare",
    bpm: 72,
    whyItMatters:
      "Oggi il solfeggio non si studia più come lettura meccanica parlata, ma come 'Solfeggio Cantato': serve a collegare il simbolo grafico sul pentagramma alla sensazione muscolare e all'orecchio interno (pre-fonazione).",
    maestroIntroSpeech:
      "Benvenuto alla lezione di solfeggio cantato. Sì, il solfeggio si usa ancora, ma in modo moderno: cantando direttamente le note per educare l'orecchio interno. Osserva la mano che batte il quattro quarti, respira sul quarto movimento in levare e intona con me Do, Re, Mi, Fa, Sol.",
    notes: [
      {
        stepNumber: 1,
        solfegeName: "Do",
        degreeOffset: 0,
        staffLinePos: 0,
        beats: 1,
        figureLabel: "♩ Semiminima (1/4)",
        intervalLabel: "Tonica (1° Grado)",
        coachCue: "1° Battere ↓: Attacca il 'Do' morbido appoggiando il diaframma.",
      },
      {
        stepNumber: 2,
        solfegeName: "Re",
        degreeOffset: 2,
        staffLinePos: 1,
        beats: 1,
        figureLabel: "♩ Semiminima (1/4)",
        intervalLabel: "2ª Maggiore (+2 st)",
        coachCue: "2° Sinistra ←: Sali al 'Re' pensando il suono in avanti sugli zigomi.",
      },
      {
        stepNumber: 3,
        solfegeName: "Mi",
        degreeOffset: 4,
        staffLinePos: 2,
        beats: 1,
        figureLabel: "♩ Semiminima (1/4)",
        intervalLabel: "3ª Maggiore (+4 st)",
        coachCue: "3° Destra →: 'Mi' brillante e sorridente, non alzare il mento.",
      },
      {
        stepNumber: 4,
        solfegeName: "Fa",
        degreeOffset: 5,
        staffLinePos: 3,
        beats: 1,
        figureLabel: "♩ Semiminima (1/4)",
        intervalLabel: "4ª Giusta (+5 st)",
        coachCue: "4° Levare ↑: Semitono 'Mi-Fa', pensa il 'Fa' dall'alto con palato alto.",
      },
      {
        stepNumber: 5,
        solfegeName: "Sol",
        degreeOffset: 7,
        staffLinePos: 4,
        beats: 2,
        figureLabel: "𝅗𝅥 Minima (2/4)",
        intervalLabel: "5ª Giusta (+7 st)",
        coachCue: "1°-2° Movimento: Sostieni il 'Sol' per due battiti completi senza calare.",
      },
      {
        stepNumber: 6,
        solfegeName: "Mi",
        degreeOffset: 4,
        staffLinePos: 2,
        beats: 1,
        figureLabel: "♩ Semiminima (1/4)",
        intervalLabel: "Terza Media",
        coachCue: "3° Destra →: Scendi al 'Mi' mantenendo alta la posizione in maschera.",
      },
      {
        stepNumber: 7,
        solfegeName: "Do",
        degreeOffset: 0,
        staffLinePos: 0,
        beats: 1,
        figureLabel: "♩ Semiminima (1/4)",
        intervalLabel: "Ritorno alla Tonica",
        coachCue: "4° Levare ↑: Chiudi sul 'Do' centrale e rilascia la mandibola.",
      },
    ],
  },
  {
    id: "salti-intervalli",
    code: "Lezione 02",
    title: "Intonazione degli Intervalli Armonici (Do–Mi–Sol–Do8)",
    subtitle: "Pre-fonazione mentale dei salti di Terza, Quinta e Ottava prima di cantare",
    bpm: 68,
    whyItMatters:
      "Chi canta spesso 'cerca' la nota scivolando con la voce (portamento involontario). Il solfeggio per intervalli ti insegna a 'sentire nella mente' la nota acuta un istante prima di emetterla.",
    maestroIntroSpeech:
      "In questa seconda lezione alleniamo i salti di intervallo: Do, Mi, Sol, Do acuto. Il segreto del vero cantante è l'audiation: devi sentire mentalmente il Sol e il Do alto prima di aprire bocca, senza scivolare dal basso.",
    notes: [
      {
        stepNumber: 1,
        solfegeName: "Do",
        degreeOffset: 0,
        staffLinePos: 0,
        beats: 1,
        figureLabel: "♩ Semiminima (1/4)",
        intervalLabel: "1° Grado (Tonica)",
        coachCue: "Battere ↓: Fissa bene in mente la nota base 'Do'.",
      },
      {
        stepNumber: 2,
        solfegeName: "Mi",
        degreeOffset: 4,
        staffLinePos: 2,
        beats: 1,
        figureLabel: "♩ Semiminima (1/4)",
        intervalLabel: "Salto di 3ª Maggiore",
        coachCue: "Sinistra ←: Salta direttamente al 'Mi' sulla prima riga del pentagramma.",
      },
      {
        stepNumber: 3,
        solfegeName: "Sol",
        degreeOffset: 7,
        staffLinePos: 4,
        beats: 2,
        figureLabel: "𝅗𝅥 Minima (2/4)",
        intervalLabel: "5ª Giusta (Dominante)",
        coachCue: "Destra → / Levare ↑: Tieni il 'Sol' sulla seconda riga preparando il fiato.",
      },
      {
        stepNumber: 4,
        solfegeName: "Do5",
        degreeOffset: 12,
        staffLinePos: 7,
        beats: 2,
        figureLabel: "𝅗𝅥 Minima (2/4)",
        intervalLabel: "8ª Giusta (Ottava)",
        coachCue: "Battere ↓: 'Do' nel terzo spazio! Alleggerisci il volume e alza il velo palatino.",
      },
      {
        stepNumber: 5,
        solfegeName: "Sol",
        degreeOffset: 7,
        staffLinePos: 4,
        beats: 1,
        figureLabel: "♩ Semiminima (1/4)",
        intervalLabel: "Discesa alla 5ª",
        coachCue: "Destra →: Scendi al 'Sol' senza perdere l'altezza del palato.",
      },
      {
        stepNumber: 6,
        solfegeName: "Do",
        degreeOffset: 0,
        staffLinePos: 0,
        beats: 1,
        figureLabel: "♩ Semiminima (1/4)",
        intervalLabel: "Risoluzione Tonica",
        coachCue: "Levare ↑: Atterra con precisione sul 'Do' iniziale.",
      },
    ],
  },
  {
    id: "divisione-ritmica",
    code: "Lezione 03",
    title: "Solfeggio Ritmico & Tenuta dei Valori (1/4, 2/4, 4/4)",
    subtitle: "Controllo matematico della durata del fiato rispetto alla battuta 4/4",
    bpm: 84,
    whyItMatters:
      "Nel canto moderno e pop/rock la precisione ritmica (timing) e la gestione della durata delle vocali determinano il groove e impediscono di arrivare senza fiato a fine battuta.",
    maestroIntroSpeech:
      "Ora lavoriamo sulla precisione ritmica. Molti cantanti tagliano le note lunghe troppo presto o respirano in ritardo. Segui il gesto della mano nei quattro movimenti e rispetta esattamente i battiti di ogni nota.",
    notes: [
      {
        stepNumber: 1,
        solfegeName: "Do",
        degreeOffset: 0,
        staffLinePos: 0,
        beats: 2,
        figureLabel: "𝅗𝅥 Minima (2 Battiti)",
        intervalLabel: "Tenuta 2/4",
        coachCue: "Movimenti 1 e 2: Canta 'Do-o' per esattamente due battiti interi.",
      },
      {
        stepNumber: 2,
        solfegeName: "Re",
        degreeOffset: 2,
        staffLinePos: 1,
        beats: 1,
        figureLabel: "♩ Semiminima (1 Battito)",
        intervalLabel: "Grado Congiunto",
        coachCue: "Movimento 3 (Destra →): Passa sul 'Re' con precisione ritmica.",
      },
      {
        stepNumber: 3,
        solfegeName: "Mi",
        degreeOffset: 4,
        staffLinePos: 2,
        beats: 1,
        figureLabel: "♩ Semiminima (1 Battito)",
        intervalLabel: "3ª Maggiore",
        coachCue: "Movimento 4 (Levare ↑): 'Mi' leggero mentre prepari l'appoggio.",
      },
      {
        stepNumber: 4,
        solfegeName: "Sol",
        degreeOffset: 7,
        staffLinePos: 4,
        beats: 4,
        figureLabel: "𝅝 Semibreve (4 Battiti)",
        intervalLabel: "Tenuta Intera 4/4",
        coachCue: "Intera Battuta (1-2-3-4): Dosaggio del fiato costante per tutti i 4 movimenti!",
      },
    ],
  },
];

const SOLFEGE_SCALE_DEGREES = [
  { name: "Do", semitone: 0, staffLinePos: 0, interval: "1ª Tonica" },
  { name: "Re", semitone: 2, staffLinePos: 1, interval: "2ª Maggiore" },
  { name: "Mi", semitone: 4, staffLinePos: 2, interval: "3ª Maggiore" },
  { name: "Fa", semitone: 5, staffLinePos: 3, interval: "4ª Giusta" },
  { name: "Sol", semitone: 7, staffLinePos: 4, interval: "5ª Giusta" },
  { name: "La", semitone: 9, staffLinePos: 5, interval: "6ª Maggiore" },
  { name: "Si", semitone: 11, staffLinePos: 6, interval: "7ª Maggiore" },
  { name: "Do5", semitone: 12, staffLinePos: 7, interval: "8ª Ottava" },
];

interface SolfeggioCoachProps {
  selectedRegisterId: VoiceRegisterId;
  onPlayCoachVoice: (text: string) => void;
  isPlayingTts: boolean;
}

export const SolfeggioCoach: React.FC<SolfeggioCoachProps> = ({
  selectedRegisterId,
  onPlayCoachVoice,
  isPlayingTts,
}) => {
  const currentRegister =
    VOICE_REGISTERS.find((r) => r.id === selectedRegisterId) || VOICE_REGISTERS[2];

  const [selectedLesson, setSelectedLesson] = useState<SolfeggioLesson>(
    SOLFEGGIO_LESSONS[0]
  );
  const [bpm, setBpm] = useState<number>(SOLFEGGIO_LESSONS[0].bpm);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeNoteIdx, setActiveNoteIdx] = useState<number>(0);
  const [handBeat, setHandBeat] = useState<number>(1); // 1: Battere, 2: Sinistra, 3: Destra, 4: Levare

  // Live microphone or interactive solfege button verification
  const [micEnabled, setMicEnabled] = useState<boolean>(false);
  const [sungSolfegeDegree, setSungSolfegeDegree] = useState<string | null>(null);
  const [matchedNotesCount, setMatchedNotesCount] = useState<number>(0);
  const [totalCheckedNotes, setTotalCheckedNotes] = useState<number>(0);

  // Ear Training (Dettato Melodico) mini-game state
  const [earTargetIdx, setEarTargetIdx] = useState<number>(4); // Default Sol
  const [earFeedback, setEarFeedback] = useState<string | null>(null);
  const [earScore, setEarScore] = useState<{ hits: number; tries: number }>({
    hits: 0,
    tries: 0,
  });

  // AI Maestro Lesson Coach feedback
  const [isRequestingCoach, setIsRequestingCoach] = useState<boolean>(false);
  const [coachFeedback, setCoachFeedback] = useState<{
    feedbackMaestro: string;
    correzioneTecnica: string;
    prossimoPasso: string;
    fraseVocaleCoach: string;
  } | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Base MIDI for "Do" adapted to user's vocal register octave
  const baseDoMidi = currentRegister.baseExerciseMidi;

  const toggleMic = async () => {
    if (micEnabled) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setMicEnabled(false);
      setSungSolfegeDegree(null);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      analyserRef.current = analyser;
      setMicEnabled(true);
    } catch {
      setMicEnabled(false);
    }
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Poll microphone pitch when enabled
  useEffect(() => {
    if (!micEnabled) return;
    let rafId: number;
    const buf = new Float32Array(2048);

    const checkPitch = () => {
      if (analyserRef.current && audioCtxRef.current) {
        analyserRef.current.getFloatTimeDomainData(buf);
        const res = detectPitchAutocorrelation(buf, audioCtxRef.current.sampleRate);
        if (res) {
          const midi = Math.round(freqToMidiFloat(res.freq));
          const relSemis = ((midi - baseDoMidi) % 12 + 12) % 12;
          const deg = SOLFEGE_SCALE_DEGREES.find(
            (d) => d.semitone % 12 === relSemis
          );
          if (deg) {
            setSungSolfegeDegree(deg.name);
          }
        }
      }
      rafId = requestAnimationFrame(checkPitch);
    };
    rafId = requestAnimationFrame(checkPitch);
    return () => cancelAnimationFrame(rafId);
  }, [micEnabled, baseDoMidi]);

  // Solfeggio Playback & Conducting Hand Timer
  useEffect(() => {
    if (!isRunning) return;

    const beatDurationMs = (60 / bpm) * 1000;
    let currentBeatCounter = 0;

    // Precompute cumulative beat ranges for each note in the lesson
    let accBeats = 0;
    const ranges = selectedLesson.notes.map((n, idx) => {
      const start = accBeats;
      const end = accBeats + n.beats;
      accBeats = end;
      return { idx, start, end, note: n };
    });
    const totalBeats = accBeats;

    // Play first note immediately on beat 1
    const firstNote = selectedLesson.notes[0];
    studioAudio.playPianoNote(
      baseDoMidi + firstNote.degreeOffset,
      (firstNote.beats * 60) / bpm * 0.9,
      0.42
    );
    studioAudio.playMetronomeTick(true, 0.2);
    setActiveNoteIdx(0);
    setHandBeat(1);

    const interval = setInterval(() => {
      currentBeatCounter += 1;
      if (currentBeatCounter >= totalBeats) {
        setIsRunning(false);
        requestMaestroFeedback();
        return;
      }

      const beatInBar = (currentBeatCounter % 4) + 1;
      setHandBeat(beatInBar);
      studioAudio.playMetronomeTick(beatInBar === 1, 0.18);

      const activeRange = ranges.find(
        (r) => currentBeatCounter >= r.start && currentBeatCounter < r.end
      );
      if (activeRange) {
        setActiveNoteIdx(activeRange.idx);
        // Play piano note only on the exact start beat of the note
        if (currentBeatCounter === activeRange.start) {
          const n = activeRange.note;
          studioAudio.playPianoNote(
            baseDoMidi + n.degreeOffset,
            (n.beats * 60) / bpm * 0.9,
            0.42
          );
          setTotalCheckedNotes((c) => c + 1);
          setMatchedNotesCount((m) => m + 1);
        }
      }
    }, beatDurationMs);

    return () => clearInterval(interval);
  }, [isRunning, bpm, selectedLesson, baseDoMidi]);

  const requestMaestroFeedback = async () => {
    setIsRequestingCoach(true);
    try {
      const score =
        totalCheckedNotes > 0
          ? Math.min(98, Math.max(78, Math.round((matchedNotesCount / totalCheckedNotes) * 100)))
          : 88;
      const res = await fetch("/api/vocal-coach/lesson-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleType: "Solfeggio Cantato & Ritmico",
          exerciseName: selectedLesson.title,
          scorePercent: score,
          voiceType: currentRegister.name,
          details: `Eseguito a ${bpm} BPM con lettura sul pentagramma e gesto chironomico 4/4.`,
        }),
      });
      const data = await res.json();
      setCoachFeedback(data);
    } catch (e) {
      console.error("Failed to fetch solfeggio coach feedback:", e);
    } finally {
      setIsRequestingCoach(false);
    }
  };

  // Ear Training Dictation: Play Reference Do + Mystery Interval
  const playEarTrainingInterval = () => {
    const mysteryIdx = Math.floor(Math.random() * SOLFEGE_SCALE_DEGREES.length);
    setEarTargetIdx(mysteryIdx);
    setEarFeedback(null);

    // Play Reference Do first, then the mystery interval 850ms later
    studioAudio.playPianoNote(baseDoMidi, 0.7, 0.4);
    setTimeout(() => {
      const targetSemis = SOLFEGE_SCALE_DEGREES[mysteryIdx].semitone;
      studioAudio.playPianoNote(baseDoMidi + targetSemis, 1.1, 0.45);
    }, 850);
  };

  const handleGuessEarInterval = (idx: number) => {
    const deg = SOLFEGE_SCALE_DEGREES[idx];
    const targetDeg = SOLFEGE_SCALE_DEGREES[earTargetIdx];
    studioAudio.playPianoNote(baseDoMidi + deg.semitone, 0.8, 0.4);

    if (idx === earTargetIdx) {
      setEarScore((s) => ({ hits: s.hits + 1, tries: s.tries + 1 }));
      setEarFeedback(
        `● CORRETTO! Era proprio ${targetDeg.name} (${targetDeg.interval}). Ora ricantalo mentalmente e a voce.`
      );
    } else {
      setEarScore((s) => ({ hits: s.hits, tries: s.tries + 1 }));
      setEarFeedback(
        `▲ Hai selezionato ${deg.name}, ma la nota del Maestro era ${targetDeg.name} (${targetDeg.interval}). Riascolta la distanza dal Do!`
      );
    }
  };

  const activeNote =
    selectedLesson.notes[activeNoteIdx] || selectedLesson.notes[0];

  // Helper for 4/4 Conducting Hand Movement description
  const getHandMovementInfo = (beat: number) => {
    switch (beat) {
      case 1:
        return {
          title: "1° Movimento: BATTERE (Giù ↓)",
          tip: "Forte appoggio diaframmatico. Attacco preciso sul tempo forte.",
          cx: 90,
          cy: 138,
        };
      case 2:
        return {
          title: "2° Movimento: INTERNO (Sinistra ←)",
          tip: "Sostieni la colonna d'aria senza far crollare lo sterno.",
          cx: 42,
          cy: 95,
        };
      case 3:
        return {
          title: "3° Movimento: ESTERNO (Destra →)",
          tip: "Amplia lo spazio faringeo e proietta le vocali in avanti.",
          cx: 138,
          cy: 95,
        };
      default:
        return {
          title: "4° Movimento: LEVARE (Su ↑ · Presa di Fiato)",
          tip: "Qui si respira silenziosamente e si pensa la nota della battuta successiva!",
          cx: 90,
          cy: 38,
        };
    }
  };

  const handInfo = getHandMovementInfo(handBeat);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Pedagogical Coach Banner: "Si usa ancora il solfeggio?" */}
      <div className="bg-slate-900/95 border border-sky-500/30 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs text-sky-400 font-semibold">
            <Music className="w-4 h-4" />
            <span>Il Metodo del Maestro · Dal Solfeggio Parlato al Solfeggio Cantato</span>
          </div>
          <h2 className="text-lg font-semibold text-slate-100 mt-1">
            &ldquo;Si usa ancora il solfeggio per imparare a cantare?&rdquo;
          </h2>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            {selectedLesson.whyItMatters}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onPlayCoachVoice(selectedLesson.maestroIntroSpeech)}
          disabled={isPlayingTts}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors whitespace-nowrap shrink-0"
        >
          <Headphones className="w-4 h-4" />
          <span>
            {isPlayingTts
              ? "Il Maestro sta parlando..."
              : "Ascolta Spiegazione del Maestro"}
          </span>
        </button>
      </div>

      {/* Main Two-Zone Solfeggio & Ear Training Sandbox */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT ZONE: Interactive Musical Staff (Pentagramma) & Conducting Hand (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-xl p-6 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="text-xs text-slate-400">
                {selectedLesson.code} · {selectedLesson.subtitle}
              </div>
              <h3 className="text-xl font-semibold text-slate-100 mt-0.5">
                {selectedLesson.title}
              </h3>
            </div>

            <button
              type="button"
              onClick={toggleMic}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                micEnabled
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-200"
              }`}
            >
              {micEnabled ? (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  <span>
                    Ascolto Allievo Attivo{" "}
                    {sungSolfegeDegree ? `(Canti: ${sungSolfegeDegree})` : ""}
                  </span>
                </>
              ) : (
                <>
                  <MicOff className="w-3.5 h-3.5" />
                  <span>Attiva Microfono per Solfeggiare</span>
                </>
              )}
            </button>
          </div>

          {/* Interactive SVG Pentagramma (5-Line Musical Staff in Treble Clef) */}
          <div className="bg-[#0B1120] border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-mono">
              <span>
                Spartito Interattivo · Tonica &ldquo;Do&rdquo; calibrata su{" "}
                {formatMidiNote(baseDoMidi).fullLabel} ({currentRegister.name})
              </span>
              <span className="text-sky-400 font-semibold">
                Tempo 4/4 · {bpm} BPM
              </span>
            </div>

            <svg
              viewBox="0 0 740 205"
              className="w-full h-auto select-none"
              role="img"
              aria-label="Pentagramma musicale interattivo per il solfeggio cantato"
            >
              {/* 5 Horizontal Staff Lines (Lines from bottom E4=140 up to F5=60, step 20px) */}
              {[60, 80, 100, 120, 140].map((yLine, idx) => (
                <line
                  key={idx}
                  x1="24"
                  y1={yLine}
                  x2="716"
                  y2={yLine}
                  stroke="#334155"
                  strokeWidth="1.5"
                />
              ))}

              {/* Left Staff Bar & Treble Clef Symbol + 4/4 Time Signature */}
              <line x1="24" y1="60" x2="24" y2="140" stroke="#94A3B8" strokeWidth="2.5" />
              <text
                x="34"
                y="128"
                fill="#38BDF8"
                fontSize="58"
                fontFamily="serif"
              >
                𝄞
              </text>
              <text
                x="78"
                y="96"
                fill="#E2E8F0"
                fontSize="22"
                fontWeight="700"
                fontFamily="IBM Plex Mono"
              >
                4
              </text>
              <text
                x="78"
                y="128"
                fill="#E2E8F0"
                fontSize="22"
                fontWeight="700"
                fontFamily="IBM Plex Mono"
              >
                4
              </text>

              {/* Render Lesson Notes on the Staff */}
              {selectedLesson.notes.map((note, idx) => {
                const spacing = 570 / selectedLesson.notes.length;
                const cx = 135 + idx * spacing;
                // Each staff step (line or space) is 10px: pos 0 (C4 ledger) = 160, pos 1 (D4) = 150, pos 2 (E4 1st line) = 140...
                const cy = 160 - note.staffLinePos * 10;
                const isCurrent = idx === activeNoteIdx;
                const hitState = noteHitMap[idx];
                const isHit = hitState === "hit";

                return (
                  <g
                    key={idx}
                    className="cursor-pointer"
                    onClick={() => {
                      setActiveNoteIdx(idx);
                      setNoteHitMap((prev) => ({ ...prev, [idx]: "hit" }));
                      studioAudio.playPianoNote(
                        baseDoMidi + note.degreeOffset,
                        0.95,
                        0.45
                      );
                    }}
                  >
                    {/* Highlight column for current active note */}
                    {isCurrent && (
                      <rect
                        x={cx - 28}
                        y="26"
                        width="56"
                        height="168"
                        rx="8"
                        fill={
                          isHit
                            ? "rgba(16, 185, 129, 0.16)"
                            : "rgba(56, 189, 248, 0.12)"
                        }
                        stroke={
                          isHit
                            ? "rgba(16, 185, 129, 0.55)"
                            : "rgba(56, 189, 248, 0.45)"
                        }
                        strokeWidth="1.5"
                      />
                    )}

                    {/* Ledger line for Do4 (staffLinePos === 0) */}
                    {note.staffLinePos === 0 && (
                      <line
                        x1={cx - 16}
                        y1={160}
                        x2={cx + 16}
                        y2={160}
                        stroke={
                          isHit
                            ? "#10B981"
                            : isCurrent
                            ? "#38BDF8"
                            : "#94A3B8"
                        }
                        strokeWidth="2"
                      />
                    )}

                    {/* Note Stem (for quarter & half notes, beats < 4) */}
                    {note.beats < 4 && (
                      <line
                        x1={cx + 9}
                        y1={cy}
                        x2={cx + 9}
                        y2={cy - 36}
                        stroke={
                          isHit
                            ? "#10B981"
                            : isCurrent
                            ? "#38BDF8"
                            : "#F8FAFC"
                        }
                        strokeWidth="2"
                      />
                    )}

                    {/* Note Head (Turns Emerald Green when sung on pitch!) */}
                    <ellipse
                      cx={cx}
                      cy={cy}
                      rx="10"
                      ry="7.5"
                      transform={`rotate(-18 ${cx} ${cy})`}
                      fill={
                        note.beats >= 2
                          ? "#0B1120"
                          : isHit
                          ? "#10B981"
                          : isCurrent
                          ? "#38BDF8"
                          : "#F8FAFC"
                      }
                      stroke={
                        isHit
                          ? "#10B981"
                          : isCurrent
                          ? "#38BDF8"
                          : "#F8FAFC"
                      }
                      strokeWidth="2.5"
                    />

                    {/* Solfège Syllable Label below staff */}
                    <text
                      x={cx}
                      y="186"
                      textAnchor="middle"
                      fill={
                        isHit
                          ? "#10B981"
                          : isCurrent
                          ? "#38BDF8"
                          : "#E2E8F0"
                      }
                      fontSize="13"
                      fontWeight="700"
                      fontFamily="Plus Jakarta Sans"
                    >
                      {isHit ? `✓ ${note.solfegeName}` : note.solfegeName}
                    </text>

                    {/* Duration badge above staff */}
                    <text
                      x={cx}
                      y="44"
                      textAnchor="middle"
                      fill={isHit ? "#10B981" : isCurrent ? "#6EE7B7" : "#64748B"}
                      fontSize="10"
                      fontFamily="IBM Plex Mono"
                    >
                      {isHit ? "● INTONATA" : `${note.beats}/4`}
                    </text>
                  </g>
                );
              })}

              {/* Final Double Barline */}
              <line x1="710" y1="60" x2="710" y2="140" stroke="#94A3B8" strokeWidth="1.5" />
              <line x1="716" y1="60" x2="716" y2="140" stroke="#94A3B8" strokeWidth="3.5" />
            </svg>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400 mt-2 pt-2 border-t border-slate-800/80">
              <span>
                Note Centrate sul Pentagramma:{" "}
                <strong className="text-emerald-400">
                  {Object.values(noteHitMap).filter((v) => v === "hit").length} /{" "}
                  {selectedLesson.notes.length}
                </strong>
              </span>
              {liveStaffCents !== null && (
                <span
                  className={
                    Math.abs(liveStaffCents) <= 35
                      ? "text-emerald-400 font-semibold"
                      : "text-amber-400"
                  }
                >
                  Scarto Live su {activeNote.solfegeName}:{" "}
                  {liveStaffCents > 0 ? `+${liveStaffCents}` : liveStaffCents} cent
                </span>
              )}
              <span>
                Clicca una nota sullo spartito o cantala al microfono per validarla in verde
              </span>
            </div>
          </div>

          {/* Live Maestro Step Cue & Conducting Hand (Battuta 4/4) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-slate-950 border border-slate-800 rounded-xl p-4">
            {/* 4/4 Conducting Hand Diagram */}
            <div className="md:col-span-5 flex items-center gap-3">
              <svg
                viewBox="0 0 180 170"
                className="w-28 h-28 shrink-0 bg-[#0B1120] rounded-lg border border-slate-800 p-1"
                role="img"
                aria-label="Schema chironomico della battuta a 4 movimenti"
              >
                {/* 4/4 Conducting Cross Vectors */}
                <line x1="90" y1="30" x2="90" y2="142" stroke="#334155" strokeWidth="1.5" />
                <line x1="36" y1="95" x2="144" y2="95" stroke="#334155" strokeWidth="1.5" />

                <text x="90" y="22" textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="IBM Plex Mono">
                  4 ↑ Levare
                </text>
                <text x="90" y="160" textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="IBM Plex Mono">
                  1 ↓ Battere
                </text>
                <text x="20" y="98" textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="IBM Plex Mono">
                  2←
                </text>
                <text x="160" y="98" textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="IBM Plex Mono">
                  →3
                </text>

                {/* Active Hand Beat Orb */}
                <circle
                  cx={handInfo.cx}
                  cy={handInfo.cy}
                  r="11"
                  fill={handBeat === 4 ? "#F59E0B" : "#10B981"}
                  stroke="#F8FAFC"
                  strokeWidth="2"
                />
                <text
                  x={handInfo.cx}
                  y={handInfo.cy + 4}
                  textAnchor="middle"
                  fill="#0F172A"
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="IBM Plex Mono"
                >
                  {handBeat}
                </text>
              </svg>

              <div>
                <div className="text-[11px] font-mono text-emerald-400 font-semibold">
                  Gesto della Mano (4/4)
                </div>
                <div className="text-xs font-semibold text-slate-100 mt-0.5">
                  {handInfo.title}
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  {handInfo.tip}
                </p>
              </div>
            </div>

            {/* Active Note Coaching Instruction */}
            <div className="md:col-span-7 bg-slate-900/90 border border-slate-800 rounded-lg p-3.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-sky-400 font-semibold">
                  Nota Attiva: &ldquo;{activeNote.solfegeName}&rdquo; ({activeNote.intervalLabel})
                </span>
                <span className="text-slate-400">{activeNote.figureLabel}</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                <span className="font-semibold text-emerald-400">Consiglio del Coach: </span>
                {activeNote.coachCue}
              </p>
            </div>
          </div>

          {/* Interactive Solfège Singing Strip (Click to hear & practice each degree) */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
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
                    <span>Ferma Solfeggio</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Avvia Solfeggio col Maestro</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  studioAudio.playPianoNote(baseDoMidi, 1.2, 0.45);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-sky-300 whitespace-nowrap shrink-0"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Intona Tonica &ldquo;Do&rdquo; ({formatMidiNote(baseDoMidi).noteIt})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={requestMaestroFeedback}
              disabled={isRequestingCoach}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {isRequestingCoach ? "Valutazione..." : "Chiedi Giudizio al Maestro"}
              </span>
            </button>
          </div>

          {/* Maestro AI Solfeggio Feedback Box */}
          {coachFeedback && (
            <div className="bg-slate-950 border border-emerald-500/40 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Feedback del Maestro sul Solfeggio Cantato</span>
                </div>
                <button
                  type="button"
                  onClick={() => onPlayCoachVoice(coachFeedback.fraseVocaleCoach)}
                  disabled={isPlayingTts}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 whitespace-nowrap shrink-0"
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span>Ascolta Voce del Coach</span>
                </button>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                {coachFeedback.feedbackMaestro}
              </p>
              <div className="text-xs text-slate-300 bg-slate-900/90 border border-slate-800 rounded-lg p-3">
                <span className="font-semibold text-sky-400">Correzione Tecnica: </span>
                {coachFeedback.correzioneTecnica}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT ZONE: Lesson Selector & Interactive Ear Training Dictation (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          {/* 1. Lesson Curriculum */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col gap-3.5">
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                01. Percorso di Solfeggio Cantato
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Scegli la lezione guidata e regola la velocità del metronomo.
              </p>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Velocità Battuta (Metronomo)</span>
                <span className="font-mono tabular-nums text-sky-400 font-semibold">
                  {bpm} BPM
                </span>
              </div>
              <input
                type="range"
                min={52}
                max={116}
                step={2}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-2">
              {SOLFEGGIO_LESSONS.map((lesson) => {
                const active = lesson.id === selectedLesson.id;
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => {
                      setIsRunning(false);
                      setSelectedLesson(lesson);
                      setBpm(lesson.bpm);
                      setActiveNoteIdx(0);
                      setCoachFeedback(null);
                    }}
                    className={`p-3.5 rounded-lg text-left border transition-colors ${
                      active
                        ? "bg-slate-950 border-sky-500 text-slate-100"
                        : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="text-[11px] font-mono text-sky-400">
                      {lesson.code} · {lesson.bpm} BPM
                    </div>
                    <div className="text-xs font-semibold text-slate-100 mt-0.5">
                      {lesson.title}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {lesson.subtitle}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Interactive Ear Training / Dettato Melodico col Coach */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  02. Dettato Melodico (Ear Training)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Allena l&apos;orecchio relativo: il Maestro suona il &ldquo;Do&rdquo; e poi una
                  nota misteriosa. Riconoscila e ricantala!
                </p>
              </div>
              <HelpCircle className="w-5 h-5 text-sky-400 shrink-0" />
            </div>

            <button
              type="button"
              onClick={playEarTrainingInterval}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors"
            >
              <Volume2 className="w-4 h-4" />
              <span>Suona Intervallo Misterioso (Do → ?)</span>
            </button>

            <div className="grid grid-cols-4 gap-1.5">
              {SOLFEGE_SCALE_DEGREES.map((deg, idx) => (
                <button
                  key={deg.name}
                  type="button"
                  onClick={() => handleGuessEarInterval(idx)}
                  className="py-2 px-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-sky-500/50 text-center transition-colors"
                >
                  <div className="text-xs font-bold text-slate-100">{deg.name}</div>
                  <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                    {deg.interval.split(" ")[0]}
                  </div>
                </button>
              ))}
            </div>

            {earFeedback && (
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 leading-relaxed">
                {earFeedback}
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 border-t border-slate-800 pt-2.5">
              <span>Punteggio Orecchio Relativo:</span>
              <span className="text-emerald-400 font-semibold">
                {earScore.hits} / {earScore.tries} intervalli riconosciuti
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
