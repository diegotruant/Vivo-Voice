import React, { useState, useEffect, useRef } from "react";
import { coachFetch } from "../utils/aiSettings";
import {
  Play,
  Square,
  RotateCcw,
  Volume2,
  Headphones,
  Mic,
  MicOff,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Clock,
} from "lucide-react";
import { AiFallbackNotice } from "./AiFallbackNotice";
import {
  studioAudio,
  formatMidiNote,
  detectPitchAutocorrelation,
  VOICE_REGISTERS,
} from "../utils/audioEngine";
import { VoiceRegisterId } from "../types/vocal";

// ---------------------------------------------------------------------------
// Per-device microphone calibration for the anti-strain volume guard.
// The user's comfortable "ah" becomes 0 dB; the strain threshold is a dB margin above it,
// so the guard no longer depends on the microphone's gain.
// ---------------------------------------------------------------------------
interface MicCalibration {
  deviceLabel: string;
  /** Median smoothed RMS of the comfortable "ah" (linear, 0..1). */
  refRms: number;
  /** Median RMS of the room while silent (linear, 0..1). */
  noiseFloor: number;
  /** ISO date of the calibration. */
  date: string;
}

const MIC_CALIBRATION_KEY = "voceviva.mic-calibration.v1";
const MARGIN_KEY = "voceviva.warmup-margin-db.v1";
const DEFAULT_MARGIN_DB = 8;
const MIN_MARGIN_DB = 3;
const MAX_MARGIN_DB = 15;
const CALIB_SILENCE_SEC = 1;
const CALIB_VOICE_SEC = 3;
const METER_MIN_DB = -30;
const METER_MAX_DB = 20;

function loadCalibrations(): Record<string, MicCalibration> {
  try {
    const raw = localStorage.getItem(MIC_CALIBRATION_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveCalibration(deviceKey: string, cal: MicCalibration): void {
  try {
    const all = loadCalibrations();
    all[deviceKey] = cal;
    localStorage.setItem(MIC_CALIBRATION_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: calibration stays for this session only */
  }
}

function loadMarginDb(): number {
  const v = Number(localStorage.getItem(MARGIN_KEY));
  return Number.isFinite(v) && v >= MIN_MARGIN_DB && v <= MAX_MARGIN_DB ? v : DEFAULT_MARGIN_DB;
}

/** Identifies the microphone in use (deviceId when exposed, else its label). */
function deviceKeyFor(stream: MediaStream): { key: string; label: string } {
  const track = stream.getAudioTracks()[0];
  const settings = track?.getSettings?.() ?? {};
  const label = track?.label || "Microfono predefinito";
  return { key: settings.deviceId || label || "default", label };
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const toDb = (ratio: number) => 20 * Math.log10(Math.max(ratio, 1e-6));

interface WarmupStage {
  id: string;
  stepIndex: number;
  code: string;
  techniqueType: "vocal-fry" | "fry-onset" | "lip-trill-5th" | "lip-trill-8ve";
  title: string;
  subtitle: string;
  recommendedSec: number;
  restSec: number;
  /** Uncalibrated fallback threshold on the legacy 0–100 meter scale. */
  maxSafeRmsPercent: number;
  /** Added to the user's margin when calibrated: fry stages must stay quieter than lip trills. */
  marginOffsetDb: number;
  physiologicalBenefit: string;
  stepByStepInstruction: string;
  antiStrainWarning: string;
  coachSpeech: string;
}

const WARMUP_STAGES: WarmupStage[] = [
  {
    id: "vocal-fry-base",
    stepIndex: 0,
    code: "Fase 01 · Meccanismo M0",
    techniqueType: "vocal-fry",
    title: "Vocal Fry Morbido (Massaggio Mucosale a Pressione Zero)",
    subtitle: "Scioglimento del muscolo tiroaritenoideo e lubrificazione della mucosa cordale",
    recommendedSec: 45,
    restSec: 15,
    maxSafeRmsPercent: 45,
    marginOffsetDb: -6,
    physiologicalBenefit:
      "Il Vocal Fry fa vibrare il bordo libero delle corde vocali a bassa frequenza (35–55 Hz) con flusso d'aria minimo, eliminando la rigidità mattutina senza alcuno scontro meccanico.",
    stepByStepInstruction:
      "Lascia cadere la mandibola rilassata. Emetti un crepitio lento e leggerissimo ('Uhhh...' come una porta che cigola piano). Se il suono si interrompe, aggiungi un filo impercettibile di fiato; non spingere mai con la gola.",
    antiStrainWarning:
      "Regola Anti-Sforzo: Il Vocal Fry deve essere appena udibile, ben sotto il tuo volume comodo. Non grattare mai la gola cercando volume!",
    coachSpeech:
      "Iniziamo il riscaldamento con 45 secondi di Vocal Fry leggerissimo. Lascia la mandibola morbida e produci un lento crepitio a volume bassissimo, come una porta che cigola. Serve a massaggiare la mucosa delle corde vocali senza alcuno sforzo.",
  },
  {
    id: "vocal-fry-onset",
    stepIndex: 1,
    code: "Fase 02 · Attacco Dolce",
    techniqueType: "fry-onset",
    title: "Dal Vocal Fry alla Nota Centrale (Onset Morbido)",
    subtitle: "Connessione fluida tra crepitio glottico e suono pieno senza colpo di glottide",
    recommendedSec: 45,
    restSec: 15,
    maxSafeRmsPercent: 55,
    marginOffsetDb: -3,
    physiologicalBenefit:
      "Partire dal Vocal Fry per entrare nella nota cantata garantisce che le corde vocali siano già accostate dolcemente prima che arrivi la pressione del fiato.",
    stepByStepInstruction:
      "Inizia con 2 secondi di Vocal Fry morbido e, senza staccare il suono, scivola dolcemente sulla tua nota comoda ('Mmm' o 'Uuu'). Mantieni la stessa leggerezza nella gola per 4 secondi, poi rilascia.",
    antiStrainWarning:
      "Regola Anti-Sforzo: Evita qualsiasi scatto brusco nel passaggio tra il crepitio e la nota tenuta.",
    coachSpeech:
      "Fase due: partiamo da due secondi di Vocal Fry e scivoliamo dolcemente sulla tua nota centrale a bocca socchiusa sulla consonante Mmm. In questo modo eliminiamo il colpo di glottide e proteggiamo le corde.",
  },
  {
    id: "lip-trill-quinta",
    stepIndex: 2,
    code: "Fase 03 · SOVTE Base",
    techniqueType: "lip-trill-5th",
    title: "Lip Trill (Trillo Labiale 'Brrrr') su Sirena di Quinta",
    subtitle: "Esercizio a tratto vocale semi-occluso per creare impedenza acustica protettiva",
    recommendedSec: 60,
    restSec: 15,
    maxSafeRmsPercent: 65,
    marginOffsetDb: 0,
    physiologicalBenefit:
      "La vibrazione delle labbra crea una contropressione d'aria (impedenza retrograda) che scende verso la laringe, tenendo le corde vocali su un cuscinetto d'aria che impedisce di sforzare.",
    stepByStepInstruction:
      "Appoggia gli indici ai lati delle guance per alleggerire le labbra. Soffia facendo vibrare le labbra ('Brrrr') mentre disegni una sirena morbida dalla nota base alla quinta superiore e ritorno (1 → 5 → 1).",
    antiStrainWarning:
      "Regola Anti-Sforzo: Se le labbra smettono di vibrare sulla nota più alta, non stringere il collo: aumenta leggermente il sostegno intercostale.",
    coachSpeech:
      "Passiamo al Lip Trill, il trillo delle labbra. Appoggia due dita sulle guance per rilassarle e fai vibrare le labbra con un Brrrr continuo su una sirena di quinta. La contropressione dell'aria sulle labbra protegge le tue corde vocali.",
  },
  {
    id: "lip-trill-ottava",
    stepIndex: 3,
    code: "Fase 04 · Passaggio Protetto",
    techniqueType: "lip-trill-8ve",
    title: "Lip Trill su Sirena d'Ottava (Connessione Petto → Testa)",
    subtitle: "Scioglimento del passaggio di registro prima dei vocalizzi a bocca aperta",
    recommendedSec: 60,
    restSec: 10,
    maxSafeRmsPercent: 65,
    marginOffsetDb: 0,
    physiologicalBenefit:
      "Permette ai muscoli cricotiroidei di allungare gradualmente le corde vocali verso gli acuti senza che la laringe salga o si chiuda.",
    stepByStepInstruction:
      "Esegui una sirena più ampia ('Brrrr') che parte dalla nota grave, attraversa il passaggio di registro fino all'ottava superiore e riscende lentamente come un sospiro di sollievo.",
    antiStrainWarning:
      "Regola Anti-Sforzo: Sull'ottava acuta riduci il volume del 20% e pensa il suono sottile dietro gli occhi.",
    coachSpeech:
      "Ultima fase del riscaldamento prima della palestra vocale: estendiamo il Lip Trill su un'intera ottava. Quando sali verso l'acuto non spingere: lascia che la voce diventi più leggera e sottile mentre le labbra continuano a vibrare.",
  },
];

interface WarmupCoachProps {
  selectedRegisterId: VoiceRegisterId;
  onPlayCoachVoice: (text: string) => void;
  isPlayingTts: boolean;
  onCompleteWarmupAndGoToStudio: () => void;
}

export const WarmupCoach: React.FC<WarmupCoachProps> = ({
  selectedRegisterId,
  onPlayCoachVoice,
  isPlayingTts,
  onCompleteWarmupAndGoToStudio,
}) => {
  const currentRegister =
    VOICE_REGISTERS.find((r) => r.id === selectedRegisterId) || VOICE_REGISTERS[2];

  const [currentStageIdx, setCurrentStageIdx] = useState<number>(0);
  const activeStage = WARMUP_STAGES[currentStageIdx] || WARMUP_STAGES[0];

  // Timer & Rest Safety State
  const [stageDurationSec, setStageDurationSec] = useState<number>(
    WARMUP_STAGES[0].recommendedSec
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isResting, setIsResting] = useState<boolean>(false);
  const [remainingSec, setRemainingSec] = useState<number>(
    WARMUP_STAGES[0].recommendedSec
  );
  const [completedStageIds, setCompletedStageIds] = useState<string[]>([]);
  const [totalWarmupSecondsLogged, setTotalWarmupSecondsLogged] = useState<number>(0);

  // Microphone Anti-Strain Volume & Vibration Monitor
  const [micActive, setMicActive] = useState<boolean>(false);
  const [liveVolumePercent, setLiveVolumePercent] = useState<number>(0);
  const [liveFreqHz, setLiveFreqHz] = useState<number | null>(null);
  // Measured vocal-fry pulse rate (median of recent detections), null until measured
  const [fryHz, setFryHz] = useState<number | null>(null);
  const [isOverpushing, setIsOverpushing] = useState<boolean>(false);
  // Level relative to the calibrated comfortable volume (dB), null when not calibrated
  const [liveRelDb, setLiveRelDb] = useState<number | null>(null);

  // Per-device calibration
  const [deviceKey, setDeviceKey] = useState<string | null>(null);
  const [deviceLabel, setDeviceLabel] = useState<string>("");
  const [calibration, setCalibration] = useState<MicCalibration | null>(null);
  const [marginDb, setMarginDb] = useState<number>(() => loadMarginDb());
  const [calibPhase, setCalibPhase] = useState<"idle" | "silence" | "voice">("idle");
  const [calibMessage, setCalibMessage] = useState<string | null>(null);

  // AI Coach Warmup Evaluation
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [coachFeedback, setCoachFeedback] = useState<{
    feedbackMaestro: string;
    correzioneTecnica: string;
    fraseVocaleCoach: string;
    isFallback?: boolean;
  } | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micPendingRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);
  // True while the exercise timer is running on a stage (not resting): only then phonation is measured
  const measuringRef = useRef<boolean>(false);
  // Measured phonation per stage: seconds with voice and seconds above the safe volume
  const stageStatsRef = useRef<Record<string, { voicedSec: number; overSec: number }>>({});
  // Read inside the rAF loop without rebuilding it
  const calibrationRef = useRef<MicCalibration | null>(null);
  const marginDbRef = useRef<number>(marginDb);
  // Whether the stats collected so far used a calibrated threshold (reported to the coach)
  const usedCalibratedRef = useRef<boolean | null>(null);
  const calibRunRef = useRef<{
    phase: "silence" | "voice";
    startT: number | null;
    silence: number[];
    voice: number[];
  } | null>(null);
  const startCalibrationAfterMicRef = useRef<boolean>(false);
  const devKeyRef = useRef<string | null>(null);
  const devLabelRef = useRef<string>("");

  useEffect(() => {
    calibrationRef.current = calibration;
  }, [calibration]);

  useEffect(() => {
    devKeyRef.current = deviceKey;
    devLabelRef.current = deviceLabel;
  }, [deviceKey, deviceLabel]);

  useEffect(() => {
    marginDbRef.current = marginDb;
    try {
      localStorage.setItem(MARGIN_KEY, String(marginDb));
    } catch {
      /* ignore */
    }
  }, [marginDb]);

  useEffect(() => {
    measuringRef.current = isRunning && !isResting;
  }, [isRunning, isResting]);

  const rootMidi = currentRegister.baseExerciseMidi;

  // Select stage handler
  const handleSelectStage = (idx: number) => {
    const st = WARMUP_STAGES[idx];
    setIsRunning(false);
    setIsResting(false);
    setCurrentStageIdx(idx);
    setStageDurationSec(st.recommendedSec);
    setRemainingSec(st.recommendedSec);
  };

  // Start / Stop Microphone Anti-Strain Monitor
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

  const toggleMicMonitor = async () => {
    if (micPendingRef.current) return;
    if (micActive) {
      releaseMic();
      setMicActive(false);
      setLiveVolumePercent(0);
      setLiveFreqHz(null);
      setFryHz(null);
      setIsOverpushing(false);
      setLiveRelDb(null);
      calibRunRef.current = null;
      startCalibrationAfterMicRef.current = false;
      setCalibPhase("idle");
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
      // Each microphone has its own gain: use (or ask for) the calibration of this device
      const dev = deviceKeyFor(stream);
      setDeviceKey(dev.key);
      setDeviceLabel(dev.label);
      setCalibration(loadCalibrations()[dev.key] ?? null);
      stream.getAudioTracks()[0]?.addEventListener("ended", () => {
        if (!mountedRef.current) return;
        releaseMic();
        setMicActive(false);
        setMicError("Il microfono è stato scollegato: riattivalo (verrà usata la sua calibrazione).");
      });
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      // 4096 samples cover ≥2 periods down to ~25 Hz, enough to measure vocal fry (35–55 Hz)
      analyser.fftSize = 4096;
      src.connect(analyser);
      analyserRef.current = analyser;
      setMicActive(true);
      if (startCalibrationAfterMicRef.current) {
        startCalibrationAfterMicRef.current = false;
        beginCalibration();
      }
    } catch (err) {
      releaseMic();
      setMicActive(false);
      startCalibrationAfterMicRef.current = false;
      const name = (err as { name?: string })?.name;
      setMicError(
        name === "NotAllowedError"
          ? "Accesso al microfono negato: abilitalo nelle impostazioni del browser."
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

  // Calibration: 1 s of silence (room noise) then ~3 s of a comfortable "ah"
  const beginCalibration = () => {
    calibRunRef.current = { phase: "silence", startT: null, silence: [], voice: [] };
    setCalibMessage(null);
    setCalibPhase("silence");
  };

  const handleCalibrate = () => {
    if (calibPhase !== "idle") return;
    if (micActive) {
      beginCalibration();
    } else {
      startCalibrationAfterMicRef.current = true;
      void toggleMicMonitor();
    }
  };

  const cancelCalibration = () => {
    calibRunRef.current = null;
    setCalibPhase("idle");
  };

  // Poll Microphone RMS & Frequency to protect against vocal strain
  useEffect(() => {
    if (!micActive) return;
    let rafId: number;
    const buf = new Float32Array(4096);
    const isFryStage =
      activeStage.techniqueType === "vocal-fry" || activeStage.techniqueType === "fry-onset";
    const fryReadings: Array<{ t: number; hz: number }> = [];
    let frame = 0;
    setFryHz(null);
    let smoothedRms = 0;
    let lastT = performance.now();
    let lastUiT = 0;
    // Uncalibrated: below this level (legacy 0–100 meter scale) the frame is silence / room noise
    const VOICED_THRESHOLD = 6;

    const monitorLoop = (now: number) => {
      if (analyserRef.current && audioCtxRef.current) {
        analyserRef.current.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          sum += buf[i] * buf[i];
        }
        const rms = Math.sqrt(sum / buf.length);
        // ~300 ms exponential smoothing so single plosives don't trip the strain alarm
        const dt = Math.min(0.2, Math.max(0, (now - lastT) / 1000));
        lastT = now;
        smoothedRms += (rms - smoothedRms) * (1 - Math.exp(-dt / 0.3));
        const smoothed = Math.min(100, smoothedRms * 380); // legacy uncalibrated meter (0–100)

        // --- calibration run ---
        const run = calibRunRef.current;
        if (run) {
          if (run.startT === null) run.startT = now;
          const elapsed = (now - run.startT) / 1000;
          if (run.phase === "silence") {
            // skip the first 0.2 s (button click / onset), then collect room noise
            if (elapsed > 0.2) run.silence.push(rms);
            if (elapsed >= CALIB_SILENCE_SEC) {
              run.phase = "voice";
              run.startT = now;
              setCalibPhase("voice");
            }
          } else {
            const floor = run.silence.length > 0 ? median(run.silence) : 0;
            // voiced = at least +10 dB above the room
            if (smoothedRms > Math.max(floor * 3.16, 1e-4) && elapsed > 0.3) run.voice.push(smoothedRms);
            if (elapsed >= CALIB_VOICE_SEC) {
              calibRunRef.current = null;
              setCalibPhase("idle");
              const voicedSec = run.voice.length * dt;
              if (run.voice.length < 20 || voicedSec < 1) {
                setCalibMessage(
                  "Voce non rilevata abbastanza a lungo: riprova tenendo una \"ah\" comoda per 3 secondi."
                );
              } else if (devKeyRef.current) {
                const cal: MicCalibration = {
                  deviceLabel: devLabelRef.current,
                  refRms: median(run.voice),
                  noiseFloor: floor,
                  date: new Date().toISOString(),
                };
                saveCalibration(devKeyRef.current, cal);
                calibrationRef.current = cal;
                setCalibration(cal);
                const snr = toDb(cal.refRms / Math.max(cal.noiseFloor, 1e-6));
                setCalibMessage(
                  snr < 15
                    ? `Calibrazione salvata, ma la stanza è rumorosa (voce solo ${Math.round(snr)} dB sopra il rumore): il controllo sarà meno preciso.`
                    : "Calibrazione salvata per questo microfono."
                );
              }
            }
          }
        }

        // --- strain guard ---
        const cal = calibrationRef.current;
        let over: boolean;
        let voiced: boolean;
        let relDb: number | null = null;
        if (cal) {
          relDb = toDb(smoothedRms / cal.refRms);
          over = relDb > marginDbRef.current + activeStage.marginOffsetDb;
          // voiced = +10 dB above the calibrated room noise and not far below the comfortable level
          voiced = smoothedRms > Math.max(cal.noiseFloor * 3.16, cal.refRms * 0.03);
        } else {
          over = smoothed > activeStage.maxSafeRmsPercent;
          voiced = smoothed > VOICED_THRESHOLD;
        }

        // UI at ~20 Hz
        if (now - lastUiT > 50) {
          lastUiT = now;
          setLiveVolumePercent(Math.round(smoothed));
          setLiveRelDb(relDb === null ? null : Math.round(relDb * 10) / 10);
          setIsOverpushing(over && voiced);
        }

        if (measuringRef.current && !run && voiced) {
          const st = (stageStatsRef.current[activeStage.id] ??= { voicedSec: 0, overSec: 0 });
          st.voicedSec += dt;
          if (over) st.overSec += dt;
          // a stats set mixing calibrated and uncalibrated frames is reported as not calibrated
          usedCalibratedRef.current = (usedCalibratedRef.current ?? true) && !!cal;
        }

        const pitchRes = detectPitchAutocorrelation(
          buf,
          audioCtxRef.current.sampleRate
        );
        setLiveFreqHz(pitchRes ? Math.round(pitchRes.freq) : null);

        // Vocal fry: low, irregular pulses. Searched only in fry stages and every 3rd frame (CPU).
        if (isFryStage && frame++ % 3 === 0 && smoothed > VOICED_THRESHOLD) {
          const fry = detectPitchAutocorrelation(buf, audioCtxRef.current.sampleRate, {
            minFreq: 28,
            maxFreq: 90,
            clarityThreshold: 0.35,
          });
          if (fry && fry.freq <= 70) fryReadings.push({ t: now, hz: fry.freq });
          while (fryReadings.length > 0 && now - fryReadings[0].t > 1500) fryReadings.shift();
          if (fryReadings.length >= 4) {
            const sorted = fryReadings.map((r) => r.hz).sort((a, b) => a - b);
            setFryHz(Math.round(sorted[Math.floor(sorted.length / 2)]));
          }
        }
      }
      rafId = requestAnimationFrame(monitorLoop);
    };

    rafId = requestAnimationFrame(monitorLoop);
    return () => cancelAnimationFrame(rafId);
  }, [
    micActive,
    activeStage.id,
    activeStage.techniqueType,
    activeStage.maxSafeRmsPercent,
    activeStage.marginOffsetDb,
  ]);

  // Countdown Timer with Automatic Anti-Strain Rest Period between stages
  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setRemainingSec((prev) => Math.max(0, prev - 1));
      if (!isResting) {
        setTotalWarmupSecondsLogged((t) => t + 1);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, isResting]);

  // Phase transitions when the countdown reaches 0 (kept out of the state updater: no side effects there)
  useEffect(() => {
    if (!isRunning || remainingSec > 0) return;
    studioAudio.playMetronomeTick(true, 0.25);

    if (!isResting) {
      // Mark current stage completed and transition to the mandatory vocal fold rest
      setCompletedStageIds((ids) =>
        ids.includes(activeStage.id) ? ids : [...ids, activeStage.id]
      );
      setIsResting(true);
      setRemainingSec(activeStage.restSec);
      return;
    }

    // Rest completed -> advance to next stage or finish
    setIsResting(false);
    setIsRunning(false);
    if (currentStageIdx < WARMUP_STAGES.length - 1) {
      const nextStage = WARMUP_STAGES[currentStageIdx + 1];
      setCurrentStageIdx(currentStageIdx + 1);
      setStageDurationSec(nextStage.recommendedSec);
      setRemainingSec(nextStage.recommendedSec);
    } else {
      setRemainingSec(activeStage.recommendedSec);
      requestWarmupCoachFeedback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec, isRunning, isResting]);

  // Meter geometry: calibrated → dB scale (METER_MIN_DB..METER_MAX_DB), else legacy 0–100 %
  const stageThresholdDb = marginDb + activeStage.marginOffsetDb;
  const meterFraction =
    calibration && liveRelDb !== null
      ? (Math.max(METER_MIN_DB, Math.min(METER_MAX_DB, liveRelDb)) - METER_MIN_DB) /
        (METER_MAX_DB - METER_MIN_DB)
      : liveVolumePercent / 100;
  const thresholdFraction = calibration
    ? (stageThresholdDb - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB)
    : activeStage.maxSafeRmsPercent / 100;

  // Play Synthesized Audio Demonstration for the current Warmup Stage
  const handlePlayStageDemo = () => {
    if (activeStage.techniqueType === "vocal-fry") {
      studioAudio.playVocalFryDemo(rootMidi, false);
    } else if (activeStage.techniqueType === "fry-onset") {
      studioAudio.playVocalFryDemo(rootMidi, true);
    } else if (activeStage.techniqueType === "lip-trill-5th") {
      studioAudio.playLipTrillDemo(rootMidi, 7);
    } else {
      studioAudio.playLipTrillDemo(rootMidi, 12);
    }
  };

  const requestWarmupCoachFeedback = async () => {
    setIsEvaluating(true);
    const stats = stageStatsRef.current;
    const totalVoiced = Object.values(stats).reduce((a, st) => a + st.voicedSec, 0);
    const totalOver = Object.values(stats).reduce((a, st) => a + st.overSec, 0);
    const measured = totalVoiced >= 1;
    const safePercent = measured
      ? Math.round((100 * (totalVoiced - totalOver)) / totalVoiced)
      : null;
    const perStage = WARMUP_STAGES.filter((st) => stats[st.id])
      .map(
        (st) =>
          `${st.code}: ${Math.round(stats[st.id].voicedSec)}s di fonazione, ${Math.round(
            stats[st.id].overSec
          )}s oltre il volume sicuro`
      )
      .join("; ");
    const thresholdNote = usedCalibratedRef.current
      ? `Soglia anti-sforzo calibrata su questo microfono: volume sicuro = fino a ${marginDb} dB sopra il volume comodo dell'allievo (meno nelle fasi di Vocal Fry).`
      : "Soglia anti-sforzo NON calibrata per questo microfono: stima euristica, dipende dal guadagno del microfono e va considerata indicativa.";
    const details = measured
      ? `Fasi completate: ${completedStageIds.length}/${WARMUP_STAGES.length}. Tempo di timer esercizio: ${totalWarmupSecondsLogged}s. Fonazione misurata col microfono: ${Math.round(totalVoiced)}s, di cui entro il volume sicuro ${safePercent}%. ${thresholdNote} Dettaglio: ${perStage}.`
      : `Fasi completate: ${completedStageIds.length}/${WARMUP_STAGES.length}. Tempo di timer esercizio: ${totalWarmupSecondsLogged}s. ${
          micActive
            ? "Microfono attivo ma nessuna fonazione rilevata durante il timer: volume non misurato."
            : "Microfono non attivo: controllo del volume anti-sforzo non misurato."
        }`;
    try {
      const res = await coachFetch("/api/vocal-coach/lesson-coach", {
          moduleType: "Riscaldamento SOVTE (Vocal Fry & Lip Trill)",
          exerciseName: activeStage.title,
          scorePercent: safePercent ?? "non misurato",
          voiceType: currentRegister.name,
          details,
        });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCoachFeedback(data);
    } catch (e) {
      console.error("Failed to fetch warmup feedback:", e);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Max safe warmup dose: 300 seconds (5 minutes)
  const maxSafeDoseSec = 300;
  const dosePercentage = Math.min(
    100,
    Math.round((totalWarmupSecondsLogged / maxSafeDoseSec) * 100)
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Top Safety & Anti-Strain Timer Header Banner */}
      <div className="bg-slate-900/95 border border-emerald-500/30 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>
              Protocollo Pre-Canto Sicuro · Vocal Fry (M0) & Lip Trill (SOVTE)
            </span>
          </div>
          <h2 className="text-lg font-semibold text-slate-100 mt-0.5">
            Riscaldamento Progressivo con Timer Anti-Sforzo Vocale
          </h2>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            Non entrare mai nella Palestra Vocale a corde fredde: il{" "}
            <strong className="text-slate-100">Vocal Fry</strong> lubrifica la mucosa a
            pressione zero, mentre il <strong className="text-slate-100">Lip Trill</strong>{" "}
            crea un cuscinetto d&apos;aria retrogrado che protegge la laringe. Il timer
            inserisce automaticamente pause di recupero per non affaticare la voce.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onPlayCoachVoice(activeStage.coachSpeech)}
            disabled={isPlayingTts}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors whitespace-nowrap shrink-0"
          >
            <Headphones className="w-4 h-4" />
            <span>
              {isPlayingTts ? "Il Coach parla..." : "Ascolta Guida del Coach"}
            </span>
          </button>

          <button
            type="button"
            onClick={onCompleteWarmupAndGoToStudio}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors whitespace-nowrap shrink-0"
          >
            <span>Vai ai Vocalizzi</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Two-Zone Warmup Sandbox */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT ZONE: Interactive Warmup Stage, Anti-Strain Timer & Acoustic Visualizer (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-xl p-6 flex flex-col gap-5">
          {/* Stage Title & Anti-Strain Status Badge */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="text-xs text-sky-400 font-mono">
                {activeStage.code} · {activeStage.subtitle}
              </div>
              <h3 className="text-xl font-semibold text-slate-100 mt-0.5">
                {activeStage.title}
              </h3>
            </div>

            <span
              className={`text-xs font-mono font-semibold px-2.5 py-1 rounded border ${
                isResting
                  ? "text-amber-300 border-amber-500/40 bg-amber-950/60"
                  : isOverpushing
                  ? "text-rose-300 border-rose-500/40 bg-rose-950/60"
                  : "text-emerald-300 border-emerald-500/40 bg-emerald-950/60"
              }`}
            >
              {isResting
                ? "▲ PAUSA DECOMPRESSIONE CORDALE"
                : isOverpushing
                ? "▲ ATTENZIONE: VOLUME ECCESSIVO!"
                : "● REGIME VOCALE PROTETTO"}
            </span>
          </div>

          {/* Interactive SVG Glottal & Lip Trill Mechanics + Big Safety Timer */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center bg-[#0B1120] border border-slate-800 rounded-xl p-5">
            {/* SVG Acoustic Visualizer */}
            <div className="md:col-span-6 flex justify-center">
              <svg
                viewBox="0 0 280 210"
                className="w-full max-w-[270px] h-auto select-none"
                role="img"
                aria-label="Visualizzatore biomeccanico di Vocal Fry e Lip Trill SOVTE"
              >
                {/* Vocal Tract Tube */}
                <rect
                  x="30"
                  y="52"
                  width="220"
                  height="96"
                  rx="18"
                  fill="rgba(15, 23, 42, 0.9)"
                  stroke="#334155"
                  strokeWidth="2"
                />

                {/* Left side: Glottis / Vocal Folds */}
                <text
                  x="42"
                  y="42"
                  fill="#94A3B8"
                  fontSize="10"
                  fontFamily="IBM Plex Mono"
                >
                  Corde Vocali (M0/M1)
                </text>
                <ellipse
                  cx="65"
                  cy="88"
                  rx="12"
                  ry={isRunning && !isResting ? 11 : 8}
                  fill="rgba(56, 189, 248, 0.25)"
                  stroke="#38BDF8"
                  strokeWidth="2.5"
                />
                <ellipse
                  cx="65"
                  cy="112"
                  rx="12"
                  ry={isRunning && !isResting ? 11 : 8}
                  fill="rgba(56, 189, 248, 0.25)"
                  stroke="#38BDF8"
                  strokeWidth="2.5"
                />

                {/* Middle: Acoustic Wave / SOVTE Retrograde Cushion */}
                {activeStage.techniqueType.startsWith("vocal-fry") ? (
                  <>
                    {/* Low-frequency discrete Vocal Fry pulses */}
                    {[105, 135, 165, 195].map((xPos, idx) => (
                      <line
                        key={idx}
                        x1={xPos}
                        y1="72"
                        x2={xPos}
                        y2="128"
                        stroke="#10B981"
                        strokeWidth={isRunning && !isResting ? "3.5" : "2"}
                        strokeDasharray="4 4"
                      />
                    ))}
                    <text
                      x="150"
                      y="168"
                      textAnchor="middle"
                      fill="#10B981"
                      fontSize="10"
                      fontFamily="IBM Plex Mono"
                    >
                      {fryHz !== null
                        ? `Impulsi M0 misurati: ~${fryHz} Hz`
                        : "Impulsi M0 (~42 Hz indicativo · non misurato)"}
                    </text>
                  </>
                ) : (
                  <>
                    {/* Lip Trill Forward + Retrograde Impedance Waves */}
                    <path
                      d="M 88 88 Q 115 68, 142 88 T 196 88"
                      fill="none"
                      stroke="#38BDF8"
                      strokeWidth="2.5"
                    />
                    <path
                      d="M 196 114 Q 168 134, 142 114 T 88 114"
                      fill="none"
                      stroke="#F59E0B"
                      strokeWidth="2.5"
                      strokeDasharray="5 3"
                    />
                    <text
                      x="145"
                      y="168"
                      textAnchor="middle"
                      fill="#F59E0B"
                      fontSize="10"
                      fontFamily="IBM Plex Mono"
                    >
                      ← Contropressione Protettiva (SOVTE)
                    </text>
                  </>
                )}

                {/* Right side: Lips (Semi-Occluded in Lip Trill, Relaxed Open in Fry) */}
                <text
                  x="202"
                  y="42"
                  fill="#94A3B8"
                  fontSize="10"
                  fontFamily="IBM Plex Mono"
                >
                  {activeStage.techniqueType.startsWith("lip-trill")
                    ? "Labbra (25 Hz)"
                    : "Bocca Morbida"}
                </text>
                <ellipse
                  cx="228"
                  cy="86"
                  rx="10"
                  ry={
                    activeStage.techniqueType.startsWith("lip-trill") ? 13 : 7
                  }
                  fill="rgba(244, 63, 94, 0.25)"
                  stroke="#FB7185"
                  strokeWidth="2.5"
                />
                <ellipse
                  cx="228"
                  cy="114"
                  rx="10"
                  ry={
                    activeStage.techniqueType.startsWith("lip-trill") ? 13 : 7
                  }
                  fill="rgba(244, 63, 94, 0.25)"
                  stroke="#FB7185"
                  strokeWidth="2.5"
                />
              </svg>
            </div>

            {/* Anti-Strain Countdown Timer & Dose Telemetry */}
            <div className="md:col-span-6 flex flex-col gap-3">
              <div
                className={`rounded-xl border p-4 ${
                  isResting
                    ? "bg-amber-950/30 border-amber-500/40"
                    : "bg-slate-950 border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    {isResting
                      ? "Timer Pausa Idratazione / Riposo"
                      : "Timer Sicurezza Esercizio"}
                  </span>
                  <span className="font-mono text-slate-300">
                    Max {stageDurationSec}s
                  </span>
                </div>

                <div className="mt-1 flex items-baseline justify-between font-mono tabular-nums">
                  <span
                    className={`text-3xl font-bold ${
                      isResting ? "text-amber-400" : "text-sky-400"
                    }`}
                  >
                    {String(Math.floor(remainingSec / 60)).padStart(2, "0")}:
                    {String(remainingSec % 60).padStart(2, "0")}
                  </span>
                  <span className="text-xs text-slate-400">
                    {isResting
                      ? "Deglutisci e rilassa la laringe"
                      : "Emissione leggera continua"}
                  </span>
                </div>

                {/* Progress bar for current stage timer */}
                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden mt-2.5">
                  <div
                    className={`h-full transition-transform duration-300 origin-left ${
                      isResting ? "bg-amber-400" : "bg-sky-500"
                    }`}
                    style={{
                      transform: `scaleX(${Math.max(
                        0.02,
                        remainingSec /
                          (isResting ? activeStage.restSec : stageDurationSec)
                      )})`,
                    }}
                  />
                </div>
              </div>

              {/* Cumulative Vocal Dose Meter (Anti-Strain Budget) */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 font-mono tabular-nums">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Dose Riscaldamento Cumulativa</span>
                  <span className="text-emerald-400 font-semibold">
                    {Math.floor(totalWarmupSecondsLogged / 60)}m{" "}
                    {totalWarmupSecondsLogged % 60}s / 5m 00s
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="h-full bg-emerald-500 transition-transform duration-150 origin-left"
                    style={{
                      transform: `scaleX(${Math.max(0.03, dosePercentage / 100)})`,
                    }}
                  />
                </div>
                <div className="text-[11px] font-sans text-slate-400 mt-1.5">
                  Fasi completate: {completedStageIds.length} di{" "}
                  {WARMUP_STAGES.length}
                </div>
              </div>
            </div>
          </div>

          {/* Step-by-Step Pedagogical Instructions & Anti-Strain Rule */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3.5">
              <div className="text-xs font-semibold text-sky-400 mb-1">
                Come Eseguirlo Correttamente
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                {activeStage.stepByStepInstruction}
              </p>
            </div>

            <div className="bg-slate-950/90 border border-amber-500/30 rounded-lg p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 mb-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Protezione Anti-Sforzo</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                {activeStage.antiStrainWarning}
              </p>
            </div>
          </div>

          {/* Live Microphone Anti-Strain Volume Guard */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-slate-200">
                  Sensore Microfonico Anti-Sforzo (Controllo Pressione e Volume)
                </div>
                <p className="text-[11px] text-slate-400">
                  {calibration ? (
                    <>
                      Verifica che il tuo Vocal Fry o Lip Trill resti leggero: al massimo{" "}
                      {stageThresholdDb >= 0 ? "+" : ""}
                      {stageThresholdDb} dB rispetto al tuo volume comodo.
                    </>
                  ) : (
                    <>
                      Verifica che il tuo Vocal Fry o Lip Trill rimanga leggero (sotto il{" "}
                      {activeStage.maxSafeRmsPercent}% sulla scala non calibrata).
                    </>
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={toggleMicMonitor}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  micActive
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                }`}
              >
                {micActive ? (
                  <>
                    <Mic className="w-3.5 h-3.5" />
                    <span>
                      Sensore Attivo{" "}
                      {liveFreqHz ? `(${liveFreqHz} Hz)` : "(In ascolto)"}
                    </span>
                  </>
                ) : (
                  <>
                    <MicOff className="w-3.5 h-3.5" />
                    <span>Attiva Controllo Microfono</span>
                  </>
                )}
              </button>
            </div>

            {micError && <p className="text-[11px] text-rose-400">{micError}</p>}

            {/* Per-device calibration */}
            <div className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] leading-snug">
                  {calibration ? (
                    <span className="text-emerald-300">
                      ● Soglia calibrata per {deviceLabel || "questo microfono"} (
                      {new Date(calibration.date).toLocaleDateString("it-IT")})
                    </span>
                  ) : micActive ? (
                    <span className="text-amber-300">
                      ▲ Soglia non calibrata per questo microfono: calibra per un controllo affidabile
                    </span>
                  ) : (
                    <span className="text-slate-400">
                      Calibra il microfono per tarare la soglia anti-sforzo sul tuo volume comodo.
                    </span>
                  )}
                </div>
                {calibPhase === "idle" ? (
                  <button
                    type="button"
                    onClick={handleCalibrate}
                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800 whitespace-nowrap"
                  >
                    {calibration ? "Ricalibra microfono" : "Calibra microfono"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={cancelCalibration}
                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 whitespace-nowrap"
                  >
                    Annulla
                  </button>
                )}
              </div>
              {calibPhase === "silence" && (
                <p className="text-xs font-semibold text-sky-300">
                  1/2 · Stai in silenzio per 1 secondo (misuro il rumore della stanza)…
                </p>
              )}
              {calibPhase === "voice" && (
                <p className="text-xs font-semibold text-sky-300">
                  2/2 · Canta una &ldquo;ah&rdquo; comoda a metà estensione, al tuo volume normale, per 3 secondi…
                </p>
              )}
              {calibMessage && calibPhase === "idle" && (
                <p className="text-[11px] text-slate-300">{calibMessage}</p>
              )}
              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                <span className="flex justify-between">
                  <span>Margine sopra il volume comodo (dB)</span>
                  <span className="font-mono text-slate-200">+{marginDb} dB</span>
                </span>
                <input
                  type="range"
                  min={MIN_MARGIN_DB}
                  max={MAX_MARGIN_DB}
                  step={1}
                  value={marginDb}
                  onChange={(e) => setMarginDb(Number(e.target.value))}
                  disabled={!calibration}
                  className="accent-sky-500 disabled:opacity-40"
                />
                <span className="text-[10px] text-slate-500">
                  {calibration
                    ? `Nelle fasi di Vocal Fry la soglia è più bassa (${activeStage.marginOffsetDb} dB rispetto al margine).`
                    : "Disponibile dopo la calibrazione."}
                </span>
              </label>
            </div>

            {micActive && (
              <div className="flex flex-col gap-1.5 font-mono text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400">
                    {calibration && liveRelDb !== null ? (
                      <>
                        Livello: {liveRelDb >= 0 ? "+" : ""}
                        {liveRelDb.toFixed(1)} dB rispetto al volume comodo (soglia{" "}
                        {stageThresholdDb >= 0 ? "+" : ""}
                        {stageThresholdDb} dB)
                      </>
                    ) : (
                      <>
                        Intensità Emissione: {liveVolumePercent}% (Limite non calibrato:{" "}
                        {activeStage.maxSafeRmsPercent}%)
                      </>
                    )}
                  </span>
                  <span
                    className={
                      isOverpushing
                        ? "text-rose-400 font-semibold"
                        : "text-emerald-400 font-semibold"
                    }
                  >
                    {isOverpushing
                      ? "▲ TROPPO FORTE: ALLEGGERISCI!"
                      : "● PRESSIONE LEGGERA OTTIMALE"}
                  </span>
                </div>
                <div className="relative w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-transform duration-75 origin-left ${
                      isOverpushing ? "bg-rose-500" : "bg-emerald-400"
                    }`}
                    style={{
                      transform: `scaleX(${Math.max(0.02, meterFraction)})`,
                    }}
                  />
                  {/* threshold marker */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-amber-300/80"
                    style={{ left: `${Math.min(100, thresholdFraction * 100)}%` }}
                    aria-hidden="true"
                  />
                </div>
                {calibration && (
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>{METER_MIN_DB} dB</span>
                    <span>0 dB = volume comodo</span>
                    <span>+{METER_MAX_DB} dB</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Transport & Audio Demonstration Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2.5">
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
                    <span>Pausa Timer</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Avvia Timer ({remainingSec}s)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePlayStageDemo}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 transition-colors whitespace-nowrap shrink-0"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>
                  Ascolta Demo{" "}
                  {activeStage.techniqueType.startsWith("vocal-fry")
                    ? "Vocal Fry"
                    : "Lip Trill"}{" "}
                  ({formatMidiNote(rootMidi).noteIt})
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsRunning(false);
                  setIsResting(false);
                  setRemainingSec(stageDurationSec);
                }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>

            <button
              type="button"
              onClick={requestWarmupCoachFeedback}
              disabled={isEvaluating}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {isEvaluating ? "Valutazione..." : "Valuta Riscaldamento"}
              </span>
            </button>
          </div>

          {coachFeedback && (
            <div className="bg-slate-950 border border-emerald-500/40 rounded-xl p-4 flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Parere del Maestro sul Riscaldamento</span>
                </div>
                <button
                  type="button"
                  onClick={() => onPlayCoachVoice(coachFeedback.fraseVocaleCoach)}
                  disabled={isPlayingTts}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-sky-500 text-slate-950"
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span>Ascolta Voce</span>
                </button>
              </div>
              <AiFallbackNotice show={coachFeedback.isFallback} />
              <p className="text-xs text-slate-200 leading-relaxed">
                {coachFeedback.feedbackMaestro}
              </p>
              <p className="text-xs text-sky-300 leading-relaxed">
                <span className="font-semibold">Indicazione Tecnica: </span>
                {coachFeedback.correzioneTecnica}
              </p>
            </div>
          )}
        </div>

        {/* RIGHT ZONE: 4-Stage Warmup Checklist & Timer Duration Slider (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Sequenza Riscaldamento Pre-Palestra
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Completa i 4 passaggi nell&apos;ordine indicato per preparare le corde vocali.
              </p>
            </div>

            {/* Duration Slider with Explicit Units */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">
                  Durata Timer Fase Attiva (Anti-Sforzo)
                </span>
                <span className="font-mono tabular-nums text-sky-400 font-semibold">
                  {stageDurationSec} secondi
                </span>
              </div>
              <input
                type="range"
                min={25}
                max={90}
                step={5}
                value={stageDurationSec}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setStageDurationSec(val);
                  if (!isRunning && !isResting) {
                    setRemainingSec(val);
                  }
                }}
                className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* 4 Stages List */}
            <div className="flex flex-col gap-2.5">
              {WARMUP_STAGES.map((st, idx) => {
                const isSelected = idx === currentStageIdx;
                const isDone = completedStageIds.includes(st.id);
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleSelectStage(idx)}
                    className={`p-3.5 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? "bg-slate-950 border-sky-500 text-slate-100"
                        : "bg-slate-950/60 border-slate-800/90 hover:border-slate-700 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-sky-400">{st.code}</span>
                      <span
                        className={
                          isDone ? "text-emerald-400 font-semibold" : "text-slate-400"
                        }
                      >
                        {isDone
                          ? "● COMPLETATO"
                          : `${st.recommendedSec}s + ${st.restSec}s pausa`}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-100 mt-1">
                      {st.title}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                      {st.physiologicalBenefit}
                    </p>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onCompleteWarmupAndGoToStudio}
              className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors mt-1"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                Riscaldamento Completato → Passa alla Palestra Vocale
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
