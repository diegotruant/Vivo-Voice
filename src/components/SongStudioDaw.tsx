import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Upload,
  Mic,
  Square,
  Play,
  Pause,
  Wand2,
  Download,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  VolumeX,
  Sparkles,
  Music,
  Headphones,
  ArrowRight,
} from "lucide-react";
import {
  detectPitchAutocorrelation,
  freqToMidiFloat,
  formatMidiNote,
  analyzeVibratoFromPoints,
  processVocalBufferWithAiMastering,
  encodeAudioBufferToWav,
  createStudioBackingStemBuffer,
  VOICE_REGISTERS,
} from "../utils/audioEngine";
import {
  VoiceRegisterId,
  SongDiagnosticResponse,
  PitchTelemetryPoint,
} from "../types/vocal";

interface SongStudioDawProps {
  selectedRegisterId: VoiceRegisterId;
  onPlayCoachVoice: (text: string) => void;
  isPlayingTts: boolean;
  onNavigateToModule: (
    tab: "diaframma" | "riscaldamento" | "solfeggio" | "palestra"
  ) => void;
}

interface WeakPassageRecord {
  timeSec: number;
  noteLabel: string;
  centsOff: number;
  issue: string;
}

export const SongStudioDaw: React.FC<SongStudioDawProps> = ({
  selectedRegisterId,
  onPlayCoachVoice,
  isPlayingTts,
  onNavigateToModule,
}) => {
  const currentRegister =
    VOICE_REGISTERS.find((r) => r.id === selectedRegisterId) ||
    VOICE_REGISTERS[2];

  // Track Buffers
  const [songName, setSongName] = useState<string>(
    "Progressione Studio in Do Maggiore (Stems Demo)"
  );
  const [backingBuffer, setBackingBuffer] = useState<AudioBuffer | null>(null);
  const [extraStemBuffer, setExtraStemBuffer] = useState<AudioBuffer | null>(
    null
  );
  const [extraStemName, setExtraStemName] = useState<string>(
    "Stem Ritmica & Basso"
  );

  const [rawVocalBuffer, setRawVocalBuffer] = useState<AudioBuffer | null>(null);
  const [correctedVocalBuffer, setCorrectedVocalBuffer] =
    useState<AudioBuffer | null>(null);
  const [useAiCorrectedVocal, setUseAiCorrectedVocal] = useState<boolean>(true);

  // Mixer Volumes & Mutes
  const [vocalGain, setVocalGain] = useState<number>(1.0);
  const [backingGain, setBackingGain] = useState<number>(0.72);
  const [extraStemGain, setExtraStemGain] = useState<number>(0.65);
  const [muteVocal, setMuteVocal] = useState<boolean>(false);
  const [muteBacking, setMuteBacking] = useState<boolean>(false);
  const [muteExtraStem, setMuteExtraStem] = useState<boolean>(false);

  // Recording & Playback State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPlayingMix, setIsPlayingMix] = useState<boolean>(false);
  const [playheadSec, setPlayheadSec] = useState<number>(0);
  const [trackDurationSec, setTrackDurationSec] = useState<number>(16);

  // Live Telemetry during Vocal Recording
  const [liveNoteLabel, setLiveNoteLabel] = useState<string>("—");
  const [liveCents, setLiveCents] = useState<number | null>(null);
  const [liveAccuracy, setLiveAccuracy] = useState<number>(0);
  const [liveStability, setLiveStability] = useState<number>(0);
  const [avgCentsDev, setAvgCentsDev] = useState<number>(0);
  const [hasVocalMetrics, setHasVocalMetrics] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isDemoTake, setIsDemoTake] = useState<boolean>(false);
  const [vibratoStats, setVibratoStats] = useState<{
    rateHz: number;
    extentCents: number;
    label: string;
  }>({ rateHz: 0, extentCents: 0, label: "Non misurato" });
  const [weakPassages, setWeakPassages] = useState<WeakPassageRecord[]>([]);
  const [minSungNote, setMinSungNote] = useState<string>("—");
  const [maxSungNote, setMaxSungNote] = useState<string>("—");

  // AI Vocal Coach Diagnostic & Mastering Parameters
  const [isAnalyzingAi, setIsAnalyzingAi] = useState<boolean>(false);
  const [isProcessingAudioAi, setIsProcessingAudioAi] =
    useState<boolean>(false);
  const [aiDiagnosis, setAiDiagnosis] =
    useState<SongDiagnosticResponse | null>(null);

  const [pitchCorrectionAmount, setPitchCorrectionAmount] =
    useState<number>(78);
  const [squilloBoostDb, setSquilloBoostDb] = useState<number>(3.5);
  const [compressionRatio, setCompressionRatio] = useState<number>(3.2);
  const [reverbWetPercent, setReverbWetPercent] = useState<number>(18);

  // Refs for Web Audio & Canvases
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const vocalGainNodeRef = useRef<GainNode | null>(null);
  const backingGainNodeRef = useRef<GainNode | null>(null);
  const extraStemGainNodeRef = useRef<GainNode | null>(null);

  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const recordedChunksRef = useRef<Float32Array[]>([]);
  const telemetryPointsRef = useRef<PitchTelemetryPoint[]>([]);
  const weakPassagesRef = useRef<WeakPassageRecord[]>([]);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const getAudioCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  // Load built-in studio backing stems on mount so the user can test immediately or upload their own MP3/WAV
  useEffect(() => {
    const harmonyBuf = createStudioBackingStemBuffer("harmony", 16);
    const rhythmBuf = createStudioBackingStemBuffer("rhythm", 16);
    setBackingBuffer(harmonyBuf);
    setExtraStemBuffer(rhythmBuf);
    setTrackDurationSec(harmonyBuf.duration);
    return () => {
      stopAllAudio();
    };
  }, []);

  // Update live gain nodes when mixer sliders move
  useEffect(() => {
    if (vocalGainNodeRef.current) {
      vocalGainNodeRef.current.gain.value = muteVocal ? 0 : vocalGain;
    }
    if (backingGainNodeRef.current) {
      backingGainNodeRef.current.gain.value = muteBacking ? 0 : backingGain;
    }
    if (extraStemGainNodeRef.current) {
      extraStemGainNodeRef.current.gain.value = muteExtraStem
        ? 0
        : extraStemGain;
    }
  }, [
    vocalGain,
    backingGain,
    extraStemGain,
    muteVocal,
    muteBacking,
    muteExtraStem,
  ]);

  // Draw Multi-Track Waveform & Playhead Canvas
  const drawMultiTrackCanvas = useCallback(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background lanes
    ctx.fillStyle = "#090E1A";
    ctx.fillRect(0, 0, w, h);

    const laneHeight = h / 3;
    const drawBufferWave = (
      buf: AudioBuffer | null,
      laneIndex: number,
      color: string,
      label: string
    ) => {
      const yTop = laneIndex * laneHeight;
      const yMid = yTop + laneHeight / 2;

      // Lane divider
      ctx.strokeStyle = "#1E293B";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, yTop + laneHeight);
      ctx.lineTo(w, yTop + laneHeight);
      ctx.stroke();

      // Label
      ctx.fillStyle = "#94A3B8";
      ctx.font = "600 10px 'IBM Plex Mono', monospace";
      ctx.fillText(label, 10, yTop + 14);

      if (!buf) {
        ctx.fillStyle = "#475569";
        ctx.font = "10px 'Plus Jakarta Sans', sans-serif";
        ctx.fillText(
          "Nessuna traccia registrata — Premi 'Registra Voce' o 'Genera Take Vocale di Test'",
          10,
          yMid + 4
        );
        return;
      }

      const data = buf.getChannelData(0);
      const step = Math.max(1, Math.floor(data.length / w));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();

      for (let x = 0; x < w; x++) {
        const startIdx = x * step;
        let maxAmp = 0;
        for (let j = 0; j < step && startIdx + j < data.length; j += 4) {
          const val = Math.abs(data[startIdx + j]);
          if (val > maxAmp) maxAmp = val;
        }
        const barH = Math.min(laneHeight * 0.42, maxAmp * laneHeight * 0.65);
        ctx.moveTo(x, yMid - barH);
        ctx.lineTo(x, yMid + barH);
      }
      ctx.stroke();
    };

    const activeVocalBuf =
      useAiCorrectedVocal && correctedVocalBuffer
        ? correctedVocalBuffer
        : rawVocalBuffer;

    drawBufferWave(
      activeVocalBuf,
      0,
      useAiCorrectedVocal && correctedVocalBuffer ? "#10B981" : "#38BDF8",
      useAiCorrectedVocal && correctedVocalBuffer
        ? "TRACCIA 1 · VOCE CANTATA (CORRETTA & MASTERIZZATA AI)"
        : "TRACCIA 1 · VOCE CANTATA (ORIGINALE RAW)"
    );
    drawBufferWave(
      backingBuffer,
      1,
      "#6366F1",
      `TRACCIA 2 · BASE PRINCIPALE (${songName.slice(0, 38)})`
    );
    drawBufferWave(
      extraStemBuffer,
      2,
      "#F59E0B",
      `TRACCIA 3 · STEM STRUMENTALE (${extraStemName.slice(0, 34)})`
    );

    // Draw Weak Passage Markers on Lane 0
    if (trackDurationSec > 0 && weakPassages.length > 0) {
      weakPassages.forEach((wp) => {
        const x = Math.min(
          w - 12,
          Math.max(12, (wp.timeSec / trackDurationSec) * w)
        );
        ctx.fillStyle = "rgba(245, 158, 11, 0.9)";
        ctx.beginPath();
        ctx.arc(x, 14, 4.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Playhead cursor
    if (trackDurationSec > 0) {
      const px = Math.min(w, (playheadSec / trackDurationSec) * w);
      ctx.strokeStyle = "#F43F5E";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
  }, [
    backingBuffer,
    extraStemBuffer,
    rawVocalBuffer,
    correctedVocalBuffer,
    useAiCorrectedVocal,
    songName,
    extraStemName,
    playheadSec,
    trackDurationSec,
    weakPassages,
  ]);

  useEffect(() => {
    drawMultiTrackCanvas();
  }, [drawMultiTrackCanvas]);

  const stopAllAudio = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // ignore
      }
    });
    activeSourcesRef.current = [];

    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch {
        // ignore
      }
      scriptProcessorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    setIsPlayingMix(false);
    setIsRecording(false);
  };

  // Upload MP3 / WAV File Handler
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: "main" | "stem"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopAllAudio();
    setIsDemoTake(false);
    setHasVocalMetrics(false);
    setAnalysisError(null);
    setAiDiagnosis(null);

    try {
      const arrayBuf = await file.arrayBuffer();
      const ctx = getAudioCtx();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      if (target === "main") {
        setBackingBuffer(decoded);
        setSongName(file.name.replace(/\.[^/.]+$/, ""));
        setTrackDurationSec(decoded.duration);
        setPlayheadSec(0);
      } else {
        setExtraStemBuffer(decoded);
        setExtraStemName(file.name.replace(/\.[^/.]+$/, ""));
      }
    } catch (err) {
      console.error("Errore decodifica file audio:", err);
    }
  };

  // Run AI Coach Diagnosis & Auto-Configure Mastering Chain
  const runAiSongDiagnosis = async (
    acc: number,
    stab: number,
    avgCents: number,
    vib: { rateHz: number; extentCents: number },
    passages: WeakPassageRecord[],
    lowN: string,
    highN: string
  ) => {
    setIsAnalyzingAi(true);
    try {
      const weakStrings =
        passages.length > 0
          ? passages.map(
              (p) =>
                `al secondo ${p.timeSec.toFixed(1)}s sulla nota ${p.noteLabel}: ${p.issue} (${p.centsOff > 0 ? `+${p.centsOff}` : p.centsOff} cent)`
            )
          : [
              "Nessun passaggio critico oltre soglia è stato registrato nei dati disponibili.",
            ];

      const res = await fetch("/api/vocal-coach/song-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          songTitle: songName,
          voiceType: currentRegister.name,
          accuracyPercent: acc,
          stabilityPercent: stab,
          avgCentsDeviation: avgCents,
          vibratoRateHz: vib.rateHz,
          vibratoExtentCents: vib.extentCents,
          lowestSungNote: lowN,
          highestSungNote: highN,
          weakPassages: weakStrings,
        }),
      });
      const data: SongDiagnosticResponse = await res.json();
      setAiDiagnosis(data);
      if (data.presetCorrezioneAi) {
        setPitchCorrectionAmount(
          data.presetCorrezioneAi.pitchCorrectionAmount ?? 78
        );
        setSquilloBoostDb(data.presetCorrezioneAi.formantSquilloBoostDb ?? 3.5);
        setCompressionRatio(data.presetCorrezioneAi.compressionRatio ?? 3.2);
        setReverbWetPercent(data.presetCorrezioneAi.reverbWetPercent ?? 18);
      }
    } catch (err) {
      console.error("Errore analisi brano AI:", err);
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  // Start Synchronized Vocal Recording Over Backing Track
  const startRecordingOverSong = async () => {
    stopAllAudio();
    setIsDemoTake(false);
    setHasVocalMetrics(false);
    setAnalysisError(null);
    setLiveAccuracy(0);
    setLiveStability(0);
    setAvgCentsDev(0);
    setVibratoStats({ rateHz: 0, extentCents: 0, label: "Non misurato" });
    setMinSungNote("—");
    setMaxSungNote("—");
    setAiDiagnosis(null);
    try {
      const ctx = getAudioCtx();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      micStreamRef.current = stream;

      recordedChunksRef.current = [];
      telemetryPointsRef.current = [];
      weakPassagesRef.current = [];
      setWeakPassages([]);
      setCorrectedVocalBuffer(null);

      // Start playing backing stems so singer hears the music while recording
      const sources: AudioBufferSourceNode[] = [];
      if (backingBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = backingBuffer;
        const g = ctx.createGain();
        g.gain.value = muteBacking ? 0 : backingGain;
        backingGainNodeRef.current = g;
        src.connect(g).connect(ctx.destination);
        src.start();
        sources.push(src);
      }
      if (extraStemBuffer) {
        const src2 = ctx.createBufferSource();
        src2.buffer = extraStemBuffer;
        const g2 = ctx.createGain();
        g2.gain.value = muteExtraStem ? 0 : extraStemGain;
        extraStemGainNodeRef.current = g2;
        src2.connect(g2).connect(ctx.destination);
        src2.start();
        sources.push(src2);
      }
      activeSourcesRef.current = sources;

      // Capture microphone samples and compute real-time pitch telemetry
      const micSource = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(2048, 1, 1);
      scriptProcessorRef.current = processor;

      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      micSource.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(ctx.destination);

      startTimeRef.current = ctx.currentTime;
      setIsRecording(true);

      processor.onaudioprocess = (ev) => {
        const input = ev.inputBuffer.getChannelData(0);
        recordedChunksRef.current.push(new Float32Array(input));

        const elapsed = ctx.currentTime - startTimeRef.current;
        const pitch = detectPitchAutocorrelation(input, ctx.sampleRate);
        if (pitch && pitch.freq && pitch.rms > 0.012) {
          const midiFloat = freqToMidiFloat(pitch.freq);
          const nearestMidi = Math.round(midiFloat);
          const cents = Math.round((midiFloat - nearestMidi) * 100);
          const noteDet = formatMidiNote(nearestMidi);
          setLiveNoteLabel(noteDet.fullLabel);
          setLiveCents(cents);

          const isOnTarget = Math.abs(cents) <= 32;
          telemetryPointsRef.current.push({
            timestamp: Date.now(),
            elapsedSec: elapsed,
            detectedFreq: pitch.freq,
            detectedMidiFloat: midiFloat,
            nearestMidi: nearestMidi,
            centsOff: cents,
            targetMidi: nearestMidi,
            rmsVolume: pitch.rms,
            isOnTarget,
          });

          // Flag weak passage if deviation > 36 cents and at least 1.8s since last flag
          if (
            Math.abs(cents) > 36 &&
            (weakPassagesRef.current.length === 0 ||
              elapsed -
                weakPassagesRef.current[weakPassagesRef.current.length - 1]
                  .timeSec >
                1.8)
          ) {
            weakPassagesRef.current.push({
              timeSec: Number(elapsed.toFixed(1)),
              noteLabel: noteDet.fullLabel,
              centsOff: cents,
              issue:
                cents < 0
                  ? "Intonazione calante / calo di appoggio"
                  : "Intonazione crescente / spinta laringea",
            });
          }
        }
      };

      const maxDur = backingBuffer ? backingBuffer.duration : 16;
      const tick = () => {
        const elapsed = ctx.currentTime - startTimeRef.current;
        setPlayheadSec(Math.min(maxDur, elapsed));
        if (elapsed >= maxDur) {
          finishRecordingVocal();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error("Impossibile avviare la registrazione microfono:", err);
      stopAllAudio();
    }
  };

  // Finalize Recorded Vocal Take & Run AI Diagnosis + Mastering
  const finishRecordingVocal = async () => {
    const ctx = getAudioCtx();
    const chunks = recordedChunksRef.current;
    stopAllAudio();

    if (chunks.length === 0) return;

    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const vocalBuf = ctx.createBuffer(1, totalLen, ctx.sampleRate);
    const channel = vocalBuf.getChannelData(0);
    let offset = 0;
    for (const c of chunks) {
      channel.set(c, offset);
      offset += c.length;
    }

    setRawVocalBuffer(vocalBuf);

    // Summarize only actual voiced frames; never substitute demo scores for missing measurements.
    const pts = telemetryPointsRef.current;
    setWeakPassages([...weakPassagesRef.current]);

    if (pts.length > 3) {
      const onTargetCount = pts.filter((p) => p.isOnTarget).length;
      const acc = Math.round((onTargetCount / pts.length) * 100);
      const centsArr = pts.map((p) => p.centsOff ?? 0);
      const avgC = Math.round(centsArr.reduce((a, b) => a + b, 0) / centsArr.length);
      const meanAbs = centsArr.reduce((a, b) => a + Math.abs(b), 0) / centsArr.length;
      const stab = Math.max(45, Math.min(98, Math.round(100 - meanAbs * 1.1)));
      const midis = pts
        .map((p) => p.nearestMidi)
        .filter((m): m is number => m !== null);
      const lowLabel = midis.length > 0 ? formatMidiNote(Math.min(...midis)).fullLabel : "—";
      const highLabel = midis.length > 0 ? formatMidiNote(Math.max(...midis)).fullLabel : "—";
      const vib = analyzeVibratoFromPoints(pts);

      setLiveAccuracy(acc);
      setLiveStability(stab);
      setAvgCentsDev(avgC);
      setVibratoStats({ rateHz: vib.rateHz, extentCents: vib.extentCents, label: vib.statusLabel });
      setMinSungNote(lowLabel);
      setMaxSungNote(highLabel);
      setHasVocalMetrics(true);
      setAnalysisError(null);

      // Trigger AI diagnosis only when there are enough measured voiced frames.
      await runAiSongDiagnosis(
        acc,
        stab,
        avgC,
        { rateHz: vib.rateHz, extentCents: vib.extentCents },
        weakPassagesRef.current,
        lowLabel,
        highLabel
      );
    } else {
      setHasVocalMetrics(false);
      setLiveAccuracy(0);
      setLiveStability(0);
      setAvgCentsDev(0);
      setVibratoStats({ rateHz: 0, extentCents: 0, label: "Non misurato" });
      setMinSungNote("—");
      setMaxSungNote("—");
      setAiDiagnosis(null);
      setAnalysisError("Registrazione acquisita, ma non ho rilevato abbastanza note vocali per una valutazione affidabile. Prova con cuffie e microfono più vicino.");
    }

    setIsProcessingAudioAi(true);
    try {
      const mastered = await processVocalBufferWithAiMastering(vocalBuf, {
        pitchCorrectionPercent: pitchCorrectionAmount,
        eqPresenceDb: squilloBoostDb,
        compressionRatio,
        reverbWetPercent,
      });
      setCorrectedVocalBuffer(mastered);
      setUseAiCorrectedVocal(true);
    } finally {
      setIsProcessingAudioAi(false);
    }
  };

  // Synthesize a realistic Test Vocal Take (with slight pitch flaws) so users can test AI Diagnosis + AI Correction + Stem Mixing anytime
  const handleGenerateTestVocalTake = async () => {
    stopAllAudio();
    const ctx = getAudioCtx();
    const duration = backingBuffer ? Math.min(16, backingBuffer.duration) : 16;
    const sr = ctx.sampleRate;
    const len = Math.floor(duration * sr);
    const testBuf = ctx.createBuffer(1, len, sr);
    const data = testBuf.getChannelData(0);

    // Melodic contour matching C major – A minor – F major – G major progression
    const melodyNotes = [
      { start: 0, end: 3.8, freq: 261.63, driftCents: -4 }, // Do4 (solid)
      { start: 4.0, end: 7.8, freq: 329.63, driftCents: -28 }, // Mi4 (slightly flat phrase ending)
      { start: 8.0, end: 11.8, freq: 349.23, driftCents: 34 }, // Fa4 (slightly sharp on passaggio)
      { start: 12.0, end: 15.6, freq: 392.0, driftCents: -6 }, // Sol4 (centered with vibrato)
    ];

    let phase = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const note = melodyNotes.find((n) => t >= n.start && t <= n.end);
      if (!note) {
        data[i] = 0;
        continue;
      }
      const noteProgress = (t - note.start) / (note.end - note.start);
      const env =
        Math.min(1, (t - note.start) / 0.08) *
        Math.min(1, (note.end - t) / 0.15);

      // Apply intentional cents drift in the second half of phrase + natural 5.6 Hz vibrato
      const currentDriftCents =
        note.driftCents * Math.pow(noteProgress, 1.2) +
        Math.sin(2 * Math.PI * 5.6 * t) * 18;
      const instFreq = note.freq * Math.pow(2, currentDriftCents / 1200);
      phase += (2 * Math.PI * instFreq) / sr;

      // Rich vocal-like harmonic series
      const sig =
        Math.sin(phase) * 0.55 +
        Math.sin(phase * 2) * 0.28 +
        Math.sin(phase * 3) * 0.14 +
        Math.sin(phase * 4) * 0.07;
      data[i] = sig * env * 0.65;
    }

    setRawVocalBuffer(testBuf);

    setIsDemoTake(true);
    setHasVocalMetrics(true);
    setAnalysisError(null);
    setAiDiagnosis(null);
    const demoWeak: WeakPassageRecord[] = [
      {
        timeSec: 6.4,
        noteLabel: "Mi4",
        centsOff: -28,
        issue: "Finale di frase calante per perdita di sostegno costale",
      },
      {
        timeSec: 10.2,
        noteLabel: "Fa4",
        centsOff: 34,
        issue: "Tendenza crescente sul passaggio per lieve spinta laringea",
      },
    ];
    setWeakPassages(demoWeak);
    setLiveAccuracy(83);
    setLiveStability(81);
    setAvgCentsDev(-9);
    setMinSungNote("Do4");
    setMaxSungNote("Sol4");
    setVibratoStats({
      rateHz: 5.6,
      extentCents: 36,
      label: "Demo sintetica · vibrato simulato",
    });

    await runAiSongDiagnosis(
      83,
      81,
      -9,
      { rateHz: 5.6, extentCents: 36 },
      demoWeak,
      "Do4",
      "Sol4"
    );

    setIsProcessingAudioAi(true);
    try {
      const mastered = await processVocalBufferWithAiMastering(testBuf, {
        pitchCorrectionPercent: 82,
        eqPresenceDb: 3.5,
        compressionRatio: 3.2,
        reverbWetPercent: 18,
      });
      setCorrectedVocalBuffer(mastered);
      setUseAiCorrectedVocal(true);
    } finally {
      setIsProcessingAudioAi(false);
    }
  };

  // Re-run AI Vocal Mastering when user adjusts the correction sliders
  const handleApplyAiMastering = async () => {
    if (!rawVocalBuffer) return;
    setIsProcessingAudioAi(true);
    try {
      const mastered = await processVocalBufferWithAiMastering(rawVocalBuffer, {
        pitchCorrectionPercent: pitchCorrectionAmount,
        eqPresenceDb: squilloBoostDb,
        compressionRatio,
        reverbWetPercent,
      });
      setCorrectedVocalBuffer(mastered);
      setUseAiCorrectedVocal(true);
    } finally {
      setIsProcessingAudioAi(false);
    }
  };

  // Synchronized Multi-Stem Playback (Vocal + Backing MP3/WAV + Extra Stem)
  const togglePlayMultiStemMix = () => {
    if (isPlayingMix) {
      stopAllAudio();
      return;
    }

    const ctx = getAudioCtx();
    const sources: AudioBufferSourceNode[] = [];
    let maxDur = 0;

    const activeVocal =
      useAiCorrectedVocal && correctedVocalBuffer
        ? correctedVocalBuffer
        : rawVocalBuffer;

    if (activeVocal) {
      const vSrc = ctx.createBufferSource();
      vSrc.buffer = activeVocal;
      const vGain = ctx.createGain();
      vGain.gain.value = muteVocal ? 0 : vocalGain;
      vocalGainNodeRef.current = vGain;
      vSrc.connect(vGain).connect(ctx.destination);
      vSrc.start(0);
      sources.push(vSrc);
      maxDur = Math.max(maxDur, activeVocal.duration);
    }

    if (backingBuffer) {
      const bSrc = ctx.createBufferSource();
      bSrc.buffer = backingBuffer;
      const bGain = ctx.createGain();
      bGain.gain.value = muteBacking ? 0 : backingGain;
      backingGainNodeRef.current = bGain;
      bSrc.connect(bGain).connect(ctx.destination);
      bSrc.start(0);
      sources.push(bSrc);
      maxDur = Math.max(maxDur, backingBuffer.duration);
    }

    if (extraStemBuffer) {
      const sSrc = ctx.createBufferSource();
      sSrc.buffer = extraStemBuffer;
      const sGain = ctx.createGain();
      sGain.gain.value = muteExtraStem ? 0 : extraStemGain;
      extraStemGainNodeRef.current = sGain;
      sSrc.connect(sGain).connect(ctx.destination);
      sSrc.start(0);
      sources.push(sSrc);
      maxDur = Math.max(maxDur, extraStemBuffer.duration);
    }

    if (sources.length === 0) return;

    activeSourcesRef.current = sources;
    startTimeRef.current = ctx.currentTime;
    setIsPlayingMix(true);

    const updatePlayhead = () => {
      const elapsed = ctx.currentTime - startTimeRef.current;
      setPlayheadSec(Math.min(maxDur, elapsed));
      if (elapsed >= maxDur) {
        stopAllAudio();
        setPlayheadSec(0);
        return;
      }
      rafRef.current = requestAnimationFrame(updatePlayhead);
    };
    rafRef.current = requestAnimationFrame(updatePlayhead);
  };

  // Export Isolated AI-Corrected Vocal Track (.WAV)
  const handleDownloadVocalWav = () => {
    const targetBuf = correctedVocalBuffer || rawVocalBuffer;
    if (!targetBuf) return;
    const blob = encodeAudioBufferToWav(targetBuf);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${songName.replace(/\s+/g, "_")}_Voce_Corretta_AI.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render & Export Complete Mixed Master Song (AI Vocal + Instrumental Stems) as 16-bit Stereo .WAV
  const handleDownloadFullMasterMixWav = async () => {
    const activeVocal =
      useAiCorrectedVocal && correctedVocalBuffer
        ? correctedVocalBuffer
        : rawVocalBuffer;
    const buffers = [activeVocal, backingBuffer, extraStemBuffer].filter(
      (b): b is AudioBuffer => b !== null
    );
    if (buffers.length === 0) return;

    const maxDuration = Math.max(...buffers.map((b) => b.duration));
    const sr = 44100;
    const offline = new OfflineAudioContext(
      2,
      Math.ceil(maxDuration * sr),
      sr
    );

    if (activeVocal && !muteVocal) {
      const src = offline.createBufferSource();
      src.buffer = activeVocal;
      const g = offline.createGain();
      g.gain.value = vocalGain;
      src.connect(g).connect(offline.destination);
      src.start(0);
    }
    if (backingBuffer && !muteBacking) {
      const src = offline.createBufferSource();
      src.buffer = backingBuffer;
      const g = offline.createGain();
      g.gain.value = backingGain;
      src.connect(g).connect(offline.destination);
      src.start(0);
    }
    if (extraStemBuffer && !muteExtraStem) {
      const src = offline.createBufferSource();
      src.buffer = extraStemBuffer;
      const g = offline.createGain();
      g.gain.value = extraStemGain;
      src.connect(g).connect(offline.destination);
      src.start(0);
    }

    const renderedMaster = await offline.startRendering();
    const blob = encodeAudioBufferToWav(renderedMaster);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${songName.replace(/\s+/g, "_")}_Brano_Master_Mix_AI.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* TOP WORKBENCH: Multi-Stem Loader, Vocal Overdub Recorder & Waveform Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Cols: Multi-Track DAW Canvas & Transport */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-xl p-6 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="text-xs text-sky-400 font-medium">
                Studio Registrazione Multi-Stem · Diagnosi Vocale & Correzione AI
              </div>
              <h2 className="text-xl font-semibold text-slate-100 mt-0.5">
                Canta su Base MP3/WAV, Scopri Punti Deboli e Masterizza con AI
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>Carica Base MP3 / WAV</span>
                <input
                  type="file"
                  accept=".mp3,.wav,.ogg,.m4a,audio/*"
                  onChange={(e) => handleFileUpload(e, "main")}
                  className="hidden"
                />
              </label>

              <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer transition-colors">
                <Music className="w-3.5 h-3.5 text-amber-400" />
                <span>+ Aggiungi Stem Strumentale</span>
                <input
                  type="file"
                  accept=".mp3,.wav,.ogg,.m4a,audio/*"
                  onChange={(e) => handleFileUpload(e, "stem")}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Multi-Track Waveform Display */}
          <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-[#090E1A]">
            <canvas
              ref={waveformCanvasRef}
              width={820}
              height={225}
              className="w-full h-[225px] block"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-950/90 border-t border-slate-800 text-xs font-mono tabular-nums">
              <div className="flex items-center gap-3">
                <span className="text-slate-300">
                  Posizione:{" "}
                  <strong className="text-sky-400">
                    {playheadSec.toFixed(1)}s
                  </strong>{" "}
                  / {trackDurationSec.toFixed(1)}s
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-300">
                  Nota Rilevata:{" "}
                  <strong className="text-emerald-400">{liveNoteLabel}</strong>
                  {liveCents !== null
                    ? ` (${liveCents > 0 ? `+${liveCents}` : liveCents} cent)`
                    : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span className="text-slate-400 text-[11px]">
                  Pallini Ambra = Passaggi critici rilevati ({weakPassages.length})
                </span>
              </div>
            </div>
          </div>

          {/* Primary Transport & Recording Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecordingOverSong}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors"
                >
                  <Mic className="w-4 h-4" />
                  <span>Registra Traccia Cantata sulla Base</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finishRecordingVocal}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
                >
                  <Square className="w-4 h-4" />
                  <span>Termina Registrazione & Analizza con AI</span>
                </button>
              )}

              <button
                type="button"
                onClick={togglePlayMultiStemMix}
                disabled={isRecording}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 transition-colors"
              >
                {isPlayingMix ? (
                  <>
                    <Pause className="w-4 h-4" />
                    <span>Ferma Ascolto Mix</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Ascolta Brano + Voce Mixata</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleGenerateTestVocalTake}
                disabled={isRecording}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium bg-slate-950 hover:bg-slate-800 text-emerald-300 border border-emerald-500/30 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Genera Take Vocale di Test (Demo AI)</span>
              </button>
            </div>

            {/* Switch Raw vs AI Corrected Vocal */}
            {rawVocalBuffer && (
              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setUseAiCorrectedVocal(false)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    !useAiCorrectedVocal
                      ? "bg-slate-800 text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Voce Raw Originale
                </button>
                <button
                  type="button"
                  onClick={() => setUseAiCorrectedVocal(true)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    useAiCorrectedVocal
                      ? "bg-emerald-500 text-slate-950"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Voce Corretta AI ✓
                </button>
              </div>
            )}
          </div>

          {/* 3-STEM MIXER CONSOLE */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {/* Stem 1: Lead Vocal */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-400">
                  1. Voce Solista {useAiCorrectedVocal ? "(AI Master)" : "(Raw)"}
                </span>
                <button
                  type="button"
                  onClick={() => setMuteVocal(!muteVocal)}
                  className={`p-1 rounded text-xs ${
                    muteVocal
                      ? "bg-rose-950 text-rose-400 border border-rose-500/40"
                      : "bg-slate-900 text-slate-300"
                  }`}
                  title="Mute / Unmute Voce"
                >
                  {muteVocal ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={1.4}
                step={0.05}
                value={vocalGain}
                onChange={(e) => setVocalGain(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>Volume Voce</span>
                <span>{Math.round(vocalGain * 100)}%</span>
              </div>
            </div>

            {/* Stem 2: Main Backing Track (MP3/WAV) */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-400 truncate">
                  2. Base: {songName}
                </span>
                <button
                  type="button"
                  onClick={() => setMuteBacking(!muteBacking)}
                  className={`p-1 rounded text-xs ${
                    muteBacking
                      ? "bg-rose-950 text-rose-400 border border-rose-500/40"
                      : "bg-slate-900 text-slate-300"
                  }`}
                  title="Mute / Unmute Base"
                >
                  {muteBacking ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={1.2}
                step={0.05}
                value={backingGain}
                onChange={(e) => setBackingGain(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>Volume Base MP3/WAV</span>
                <span>{Math.round(backingGain * 100)}%</span>
              </div>
            </div>

            {/* Stem 3: Additional Instrumental Stem */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-400 truncate">
                  3. {extraStemName}
                </span>
                <button
                  type="button"
                  onClick={() => setMuteExtraStem(!muteExtraStem)}
                  className={`p-1 rounded text-xs ${
                    muteExtraStem
                      ? "bg-rose-950 text-rose-400 border border-rose-500/40"
                      : "bg-slate-900 text-slate-300"
                  }`}
                  title="Mute / Unmute Stem"
                >
                  {muteExtraStem ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={1.2}
                step={0.05}
                value={extraStemGain}
                onChange={(e) => setExtraStemGain(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>Volume Stem Strumenti</span>
                <span>{Math.round(extraStemGain * 100)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right 4 Cols: AI Vocal Pitch Correction & Studio Mastering Rack + WAV Export */}
        <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <div className="text-xs text-emerald-400 font-medium">
                Catena DSP & Correzione Intonazione AI
              </div>
              <h3 className="text-lg font-semibold text-slate-100 mt-0.5">
                Mastering Vocale & Mix negli Stems
              </h3>
            </div>
            <Sliders className="w-5 h-5 text-emerald-400 shrink-0" />
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            La catena AI riallinea i centesimi calanti/crescenti della tua
            traccia vocale, esalta la 3° Formante dello Squillo (3 kHz) e
            applica compressione ottica per fonderla negli stem strumentali.
          </p>

          {/* Mastering Parameter Sliders */}
          <div className="flex flex-col gap-3">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-200 font-medium">
                  1. Correzione Intonazione AI (Pitch Center)
                </span>
                <span className="font-mono text-emerald-400 font-semibold">
                  {pitchCorrectionAmount}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={pitchCorrectionAmount}
                onChange={(e) =>
                  setPitchCorrectionAmount(Number(e.target.value))
                }
                className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-200 font-medium">
                  2. Presenza & Squillo (3.0 kHz Formant EQ)
                </span>
                <span className="font-mono text-sky-400 font-semibold">
                  +{squilloBoostDb.toFixed(1)} dB
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={6}
                step={0.5}
                value={squilloBoostDb}
                onChange={(e) => setSquilloBoostDb(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-200 font-medium">
                  3. Compressione Ottica Vocale
                </span>
                <span className="font-mono text-amber-300 font-semibold">
                  {compressionRatio.toFixed(1)} : 1
                </span>
              </div>
              <input
                type="range"
                min={1.5}
                max={6.0}
                step={0.5}
                value={compressionRatio}
                onChange={(e) => setCompressionRatio(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-200 font-medium">
                  4. Riverbero Plate da Studio (Amalgama Stem)
                </span>
                <span className="font-mono text-indigo-300 font-semibold">
                  {reverbWetPercent}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={45}
                step={3}
                value={reverbWetPercent}
                onChange={(e) => setReverbWetPercent(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleApplyAiMastering}
            disabled={!rawVocalBuffer || isProcessingAudioAi}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 transition-colors"
          >
            <Wand2 className="w-4 h-4" />
            <span>
              {isProcessingAudioAi
                ? "Elaborazione DSP & Pitch AI in corso..."
                : "Ricalcola Correzione & Mastering Vocale AI"}
            </span>
          </button>

          {/* Export WAV Buttons */}
          <div className="border-t border-slate-800 pt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleDownloadFullMasterMixWav}
              disabled={!rawVocalBuffer && !backingBuffer}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Esporta Brano Cantato Completo (.WAV Master)</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadVocalWav}
              disabled={!rawVocalBuffer}
              className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg text-xs font-medium bg-slate-950 hover:bg-slate-800 disabled:opacity-40 text-slate-200 border border-slate-800 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Esporta Solo Stem Voce Corretta AI (.WAV)</span>
            </button>
          </div>
        </div>
      </div>

      {/* BOTTOM WORKBENCH: AI Vocal Coach Report — Punti di Forza & Punti Deboli su cui Allenarsi */}
      {analysisError && (
        <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-sm text-amber-200">
          {analysisError}
        </div>
      )}
      {isDemoTake && (
        <div className="rounded-lg border border-sky-500/40 bg-sky-950/30 p-3 text-sm text-sky-200">
          Take dimostrativa sintetica: i punteggi e il vibrato sono illustrativi e non rappresentano misurazioni di una voce reale.
        </div>
      )}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-xs text-sky-400 font-medium">
              Analisi Tecnica dell&apos;Esecuzione sul Brano · Gemini Vocal Coach
            </div>
            <h3 className="text-xl font-semibold text-slate-100 mt-0.5">
              Diagnosi Punti di Forza, Punti Deboli e Piano d&apos;Allenamento Mirato
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
              Intonazione:{" "}
              <strong className="text-emerald-400">{hasVocalMetrics ? `${liveAccuracy}%` : "—"}</strong>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
              Stabilità:{" "}
              <strong className="text-sky-400">{hasVocalMetrics ? `${liveStability}%` : "—"}</strong>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
              Vibrato:{" "}
              <strong className="text-amber-300">
                {hasVocalMetrics
                  ? vibratoStats.rateHz > 0
                    ? `${vibratoStats.rateHz} Hz (±${vibratoStats.extentCents} cent)`
                    : vibratoStats.label
                  : "Non misurato"}
              </strong>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
              Range Brano:{" "}
              <strong className="text-slate-200">
                {hasVocalMetrics ? `${minSungNote} – ${maxSungNote}` : "—"}
              </strong>
            </div>
          </div>
        </div>

        {isAnalyzingAi && (
          <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-sky-300">
            Il Maestro di Canto AI sta analizzando la tua traccia vocale, i
            passaggi critici e preparando i parametri di correzione...
          </div>
        )}

        {!aiDiagnosis && !isAnalyzingAi && (
          <div className="p-6 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Carica la tua base musicale MP3/WAV (oppure usa gli stem da studio
              già pronti) e premi{" "}
              <strong className="text-rose-400">
                &ldquo;Registra Traccia Cantata sulla Base&rdquo;
              </strong>{" "}
              o{" "}
              <strong className="text-emerald-400">
                &ldquo;Genera Take Vocale di Test&rdquo;
              </strong>
              . L&apos;app identificherà i tuoi punti di forza, i passaggi deboli
              su cui allenarti e correggerà la voce per il mix finale.
            </div>
            <button
              type="button"
              onClick={handleGenerateTestVocalTake}
              className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 whitespace-nowrap shrink-0"
            >
              Prova Ora con Take Vocale Demo
            </button>
          </div>
        )}

        {aiDiagnosis && (
          <div className="flex flex-col gap-5">
            {/* Summary Banner + Voice Playback */}
            <div className="bg-slate-950 border border-sky-500/30 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="text-xs font-semibold text-sky-400">
                  Valutazione Complessiva del Maestro AI
                </div>
                <p className="text-sm text-slate-100 leading-relaxed">
                  {aiDiagnosis.sintesiPerformance}
                </p>
                {aiDiagnosis.presetCorrezioneAi?.spiegazioneMastering && (
                  <p className="text-xs text-emerald-400 mt-1">
                    <strong>Intervento AI applicato alla traccia: </strong>
                    {aiDiagnosis.presetCorrezioneAi.spiegazioneMastering}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  onPlayCoachVoice(aiDiagnosis.messaggioVocaleCoach)
                }
                disabled={isPlayingTts}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 whitespace-nowrap shrink-0"
              >
                <Headphones className="w-4 h-4" />
                <span>
                  {isPlayingTts
                    ? "Voce del Coach in corso..."
                    : "Ascolta Feedback del Coach"}
                </span>
              </button>
            </div>

            {/* 2-Column Strengths vs Weaknesses To Train */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* PUNTI DI FORZA */}
              <div className="bg-slate-950/90 border border-emerald-500/30 rounded-xl p-5 flex flex-col gap-3.5">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Punti di Forza Rilevati nella Performance</span>
                </div>

                <div className="flex flex-col gap-3">
                  {aiDiagnosis.puntiDiForza.map((pf, i) => (
                    <div
                      key={i}
                      className="bg-slate-900/90 border border-slate-800 rounded-lg p-3.5"
                    >
                      <div className="text-xs font-semibold text-emerald-300">
                        ✓ {pf.titolo}
                      </div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        {pf.dettaglio}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* PUNTI DEBOLI SU CUI ALLENARSI (with direct links to training modules) */}
              <div className="bg-slate-950/90 border border-amber-500/30 rounded-xl p-5 flex flex-col gap-3.5">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Punti Deboli & Esercizi Specifici su cui Allenarsi</span>
                </div>

                <div className="flex flex-col gap-3">
                  {aiDiagnosis.puntiDeboliDaAllenare.map((pd, i) => (
                    <div
                      key={i}
                      className="bg-slate-900/90 border border-slate-800 rounded-lg p-3.5 flex flex-col gap-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-amber-300">
                          ▲ {pd.area}
                        </span>
                        <button
                          type="button"
                          onClick={() => onNavigateToModule(pd.moduloApp)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 transition-colors"
                        >
                          <span>Allenati nel Modulo {pd.moduloApp.toUpperCase()}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        <strong className="text-slate-100">
                          Causa Fisiologica:{" "}
                        </strong>
                        {pd.causaFisiologica}
                      </p>
                      <p className="text-xs text-emerald-300 leading-relaxed">
                        <strong>Esercizio Correttivo: </strong>
                        {pd.esercizioConsigliato}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
