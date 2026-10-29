import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Volume2,
  Send,
  Headphones,
  Sliders,
  CheckCircle2,
  RotateCcw,
  Move,
  Radio,
  Mic,
  MicOff,
} from "lucide-react";
import { studioAudio, formatMidiNote } from "../utils/audioEngine";
import {
  AiConsultationResponse,
  AiAnalysisResult,
  VoiceRegisterId,
} from "../types/vocal";

interface VowelFormantPreset {
  vowel: "A" | "E" | "I" | "O" | "U";
  name: string;
  baseF1: number;
  baseF2: number;
  baseF3: number;
  defaultLipOpening: number; // 20 to 100%
  defaultLipRounding: number; // -20 (protruded/rounded) to +20 (spread/smiling)
  tongueArch: string;
  pedagogicalTip: string;
}

const VOWEL_PRESETS: VowelFormantPreset[] = [
  {
    vowel: "A",
    name: "Vocale /a/ Centrale Aperta",
    baseF1: 750,
    baseF2: 1250,
    baseF3: 2750,
    defaultLipOpening: 82,
    defaultLipRounding: 0,
    tongueArch: "Piatta e morbida dietro gli incisivi inferiori",
    pedagogicalTip:
      "Immagina di pronunciare 'Ah' con un leggero stupore verticale per non schiacciare la retrobocca.",
  },
  {
    vowel: "E",
    name: "Vocale /e/ Anteriore Media",
    baseF1: 520,
    baseF2: 1950,
    baseF3: 2800,
    defaultLipOpening: 58,
    defaultLipRounding: 8,
    tongueArch: "Dorso linguale lievemente arcuato in avanti",
    pedagogicalTip:
      "Ricca di armonici brillanti (F2 alta). Sul passaggio arrotondala leggermente con le labbra verso 'Ö'.",
  },
  {
    vowel: "I",
    name: "Vocale /i/ Anteriore Chiusa (Risonanza in Maschera)",
    baseF1: 310,
    baseF2: 2350,
    baseF3: 3000,
    defaultLipOpening: 36,
    defaultLipRounding: 14,
    tongueArch: "Alta anteriormente, spazio faringeo ampio dietro",
    pedagogicalTip:
      "Ottima per trovare lo squillo e la chiusura cordale. Se stringe, arrotonda le labbra e abbassa la laringe.",
  },
  {
    vowel: "O",
    name: "Vocale /o/ Posteriore Arrotondata",
    baseF1: 500,
    baseF2: 920,
    baseF3: 2680,
    defaultLipOpening: 56,
    defaultLipRounding: -10,
    tongueArch: "Radice linguale libera, labbra dolcemente raccolte",
    pedagogicalTip:
      "Conferisce rotondità e cavità al suono (F2 più grave). Evita di retrarre la lingua verso la faringe.",
  },
  {
    vowel: "U",
    name: "Vocale /u/ Posteriore Chiusa (Copertura & Passaggio)",
    baseF1: 330,
    baseF2: 780,
    baseF3: 2550,
    defaultLipOpening: 34,
    defaultLipRounding: -16,
    tongueArch: "Velo palatino sollevato, laringe naturalmente rilassata",
    pedagogicalTip:
      "La vocale regina per alleggerire il passaggio verso la voce di testa e allungare il tratto vocale.",
  },
];

const QUICK_QUESTIONS = [
  "Come evito di stringere la gola quando salgo sulle note acute?",
  "Come faccio a trovare la Voce Mista (Mix Voice) senza spezzare il suono?",
  "Qual è la differenza pratica tra Appoggio e Sostegno diaframmatico?",
  "Come posso usare le labbra per ammorbidire un suono troppo stridulo?",
];

interface AnatomyFormantLabProps {
  selectedRegisterId: VoiceRegisterId;
  lowNoteLabel: string;
  highNoteLabel: string;
  recentAccuracy: number | null;
  lastAnalysis: AiAnalysisResult | null;
  lastExerciseTitle: string;
  onPlayCoachVoice: (text: string) => void;
  isPlayingTts: boolean;
}

export const AnatomyFormantLab: React.FC<AnatomyFormantLabProps> = ({
  selectedRegisterId,
  lowNoteLabel,
  highNoteLabel,
  recentAccuracy,
  lastAnalysis,
  lastExerciseTitle,
  onPlayCoachVoice,
  isPlayingTts,
}) => {
  const [selectedVowel, setSelectedVowel] = useState<VowelFormantPreset>(
    VOWEL_PRESETS[0]
  );

  // Interactive anatomical parameters:
  // 1. Larynx vertical position: -20 mm (low/noble/covered) to +20 mm (high/strained)
  const [larynxShift, setLarynxShift] = useState<number>(-4);
  // 2. Lip rounding / protrusion: -20 (rounded/protruded trumpet lips -> lengthens tract & lowers F2) to +20 (spread/smiling lips -> shortens tract & raises F2)
  const [lipRounding, setLipRounding] = useState<number>(
    VOWEL_PRESETS[0].defaultLipRounding
  );
  // 3. Lip & Jaw vertical opening: 20% (closed) to 100% (wide open -> raises F1)
  const [lipOpening, setLipOpening] = useState<number>(
    VOWEL_PRESETS[0].defaultLipOpening
  );
  // 4. Soft palate elevation: 30% to 100%
  const [palateElevation, setPalateElevation] = useState<number>(85);
  const [demoMidi, setDemoMidi] = useState<number>(60); // Do4

  // Direct SVG dragging state ("larynx" | "lips" | null)
  const [draggingTarget, setDraggingTarget] = useState<"larynx" | "lips" | null>(
    null
  );
  const [liveAudioDrone, setLiveAudioDrone] = useState<boolean>(false);

  // VoceVista-style Real-Time Microphone FFT Spectrum Overlay & Squillo 3kHz Detector
  const [micFftActive, setMicFftActive] = useState<boolean>(false);
  const [micFftPath, setMicFftPath] = useState<string>("");
  const [squilloPercent, setSquilloPercent] = useState<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micRafRef = useRef<number | null>(null);

  const tractSvgRef = useRef<SVGSVGElement | null>(null);

  // AI Consultation state
  const [question, setQuestion] = useState<string>("");
  const [isLoadingAsk, setIsLoadingAsk] = useState<boolean>(false);
  const [consultation, setConsultation] = useState<AiConsultationResponse | null>(
    null
  );

  // Acoustic Physics Model: Compute real-time F1, F2, F3 based on Larynx height, Lip Rounding, Lip Opening, and Soft Palate
  // - Lowering the larynx (-larynxShift) lengthens the pharyngeal cavity -> lowers both F1 and F2 (darker, covered timbre).
  // - Raising the larynx (+larynxShift) shortens the vocal tract -> raises both F1 and F2 (brighter/strained timbre).
  // - Lip Opening (+lipOpening) primarily raises F1 (first formant is proportional to mouth opening).
  // - Lip Rounding/Protrusion (-lipRounding) lengthens the front oral lip tube -> strongly lowers F2; Spreading lips (+lipRounding) raises F2.
  const { f1Effective, f2Effective, f3Effective, deltaF1, deltaF2, tractLengthCm } =
    useMemo(() => {
      const larynxFactor = 1 + larynxShift * 0.0085;
      const openingDelta =
        (lipOpening - selectedVowel.defaultLipOpening) * 0.0038;
      const roundingDeltaF1 = lipRounding * 0.0022;
      const roundingDeltaF2 = lipRounding * 0.0095;
      const palateFactor = 0.94 + (palateElevation / 100) * 0.08;

      const f1 = Math.round(
        Math.max(
          220,
          Math.min(
            1050,
            selectedVowel.baseF1 *
              larynxFactor *
              (1 + openingDelta + roundingDeltaF1)
          )
        )
      );

      const f2 = Math.round(
        Math.max(
          620,
          Math.min(
            2750,
            selectedVowel.baseF2 *
              larynxFactor *
              (1 + roundingDeltaF2) *
              palateFactor
          )
        )
      );

      const f3 = Math.round(
        Math.max(
          2200,
          Math.min(
            3350,
            selectedVowel.baseF3 *
              (1 + larynxShift * 0.004 + lipRounding * 0.003) *
              (0.9 + (palateElevation / 100) * 0.14)
          )
        )
      );

      // Estimate effective vocal tract length in cm (neutral adult ~17.5 cm)
      const lengthCm = +(
        17.5 -
        larynxShift * 0.075 -
        lipRounding * 0.045
      ).toFixed(1);

      return {
        f1Effective: f1,
        f2Effective: f2,
        f3Effective: f3,
        deltaF1: f1 - selectedVowel.baseF1,
        deltaF2: f2 - selectedVowel.baseF2,
        tractLengthCm: lengthCm,
      };
    }, [selectedVowel, larynxShift, lipRounding, lipOpening, palateElevation]);

  // Update live Web Audio formant synthesizer if continuous drone is active
  useEffect(() => {
    if (liveAudioDrone) {
      studioAudio.updateLiveFormant(
        demoMidi,
        f1Effective,
        f2Effective,
        f3Effective
      );
    }
  }, [liveAudioDrone, demoMidi, f1Effective, f2Effective, f3Effective]);

  useEffect(() => {
    return () => {
      studioAudio.stopLiveFormant();
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (micCtxRef.current && micCtxRef.current.state !== "closed") {
        micCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const stopMicFft = () => {
    if (micRafRef.current) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (micCtxRef.current && micCtxRef.current.state !== "closed") {
      micCtxRef.current.close().catch(() => {});
      micCtxRef.current = null;
    }
    setMicFftActive(false);
    setMicFftPath("");
    setSquilloPercent(0);
  };

  const toggleMicFft = async () => {
    if (micFftActive) {
      stopMicFft();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStreamRef.current = stream;
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      micCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      setMicFftActive(true);

      const width = 460;
      const height = 145;
      const maxHz = 3400;

      const updateFft = () => {
        analyser.getByteFrequencyData(freqData);
        const nyquist = ctx.sampleRate / 2;
        const binCount = freqData.length;

        const pts: string[] = [];
        for (let x = 0; x <= width; x += 6) {
          const hz = (x / width) * maxHz;
          const bin = Math.min(
            binCount - 1,
            Math.max(0, Math.round((hz / nyquist) * binCount))
          );
          const norm = freqData[bin] / 255;
          const y = height - 22 - norm * (height - 42);
          pts.push(`${x === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
        }
        setMicFftPath(pts.join(" "));

        // Compute Singer's Formant / Squillo energy around 2750-3250 Hz
        const binStart = Math.max(1, Math.floor((2750 / nyquist) * binCount));
        const binEnd = Math.min(binCount - 1, Math.ceil((3250 / nyquist) * binCount));
        let sumSquillo = 0;
        for (let b = binStart; b <= binEnd; b++) {
          sumSquillo += freqData[b];
        }
        const avgSquillo = sumSquillo / Math.max(1, binEnd - binStart + 1);
        setSquilloPercent(Math.min(100, Math.round((avgSquillo / 185) * 100)));

        micRafRef.current = requestAnimationFrame(updateFft);
      };

      micRafRef.current = requestAnimationFrame(updateFft);
    } catch {
      stopMicFft();
    }
  };

  const toggleLiveAudioDrone = () => {
    if (liveAudioDrone) {
      studioAudio.stopLiveFormant();
      setLiveAudioDrone(false);
    } else {
      studioAudio.startLiveFormant(
        demoMidi,
        f1Effective,
        f2Effective,
        f3Effective
      );
      setLiveAudioDrone(true);
    }
  };

  const handleSelectVowel = (v: VowelFormantPreset) => {
    setSelectedVowel(v);
    setLipOpening(v.defaultLipOpening);
    setLipRounding(v.defaultLipRounding);
    if (!liveAudioDrone) {
      studioAudio.playVowelFormantDemo(
        demoMidi,
        v.baseF1,
        v.baseF2,
        v.baseF3,
        1.1
      );
    }
  };

  const handleResetAnatomy = () => {
    setLarynxShift(-4);
    setLipOpening(selectedVowel.defaultLipOpening);
    setLipRounding(selectedVowel.defaultLipRounding);
    setPalateElevation(85);
  };

  // Pointer drag handler on the Sagittal Vocal Tract SVG
  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingTarget || !tractSvgRef.current) return;
    const rect = tractSvgRef.current.getBoundingClientRect();
    const scaleX = 280 / rect.width;
    const scaleY = 235 / rect.height;
    const svgX = (e.clientX - rect.left) * scaleX;
    const svgY = (e.clientY - rect.top) * scaleY;

    if (draggingTarget === "larynx") {
      // Neutral Y for larynx center is 178. Dragging up (<178) increases larynxShift (+20), dragging down (>178) lowers larynxShift (-20)
      const rawShift = Math.round((178 - svgY) * 1.15);
      const clampedShift = Math.max(-20, Math.min(20, rawShift));
      setLarynxShift(clampedShift);
    } else if (draggingTarget === "lips") {
      // Horizontal svgX around 52 controls lip protrusion/rounding: further left (<52) = protruded/rounded (-20), further right (>52) = spread/smiling (+20)
      const rawRounding = Math.round((svgX - 54) * 1.15);
      const clampedRounding = Math.max(-20, Math.min(20, rawRounding));
      setLipRounding(clampedRounding);

      // Vertical distance from upper lip (y=96) controls lipOpening (20% to 100%)
      const rawOpening = Math.round((svgY - 94) * 2.1);
      const clampedOpening = Math.max(20, Math.min(100, rawOpening));
      setLipOpening(clampedOpening);
    }
  };

  const handleSvgPointerUp = () => {
    if (draggingTarget && !liveAudioDrone) {
      studioAudio.playVowelFormantDemo(
        demoMidi,
        f1Effective,
        f2Effective,
        f3Effective,
        0.95
      );
    }
    setDraggingTarget(null);
  };

  // Generate SVG path for the Real-Time Formant Frequency Response Spectrum (0 Hz to 3400 Hz)
  const spectrumPaths = useMemo(() => {
    const width = 460;
    const height = 145;
    const maxHz = 3400;

    const buildCurve = (f1: number, f2: number, f3: number) => {
      const points: string[] = [];
      for (let x = 0; x <= width; x += 6) {
        const hz = (x / width) * maxHz;
        // Sum of 3 Lorentzian/Gaussian formant resonance peaks
        const g1 = Math.exp(-Math.pow((hz - f1) / 145, 2)) * 0.92;
        const g2 = Math.exp(-Math.pow((hz - f2) / 185, 2)) * 0.78;
        const g3 = Math.exp(-Math.pow((hz - f3) / 210, 2)) * 0.56;
        const glottalTilt = Math.max(0.05, 0.18 - (hz / maxHz) * 0.12);
        const amp = Math.min(1, glottalTilt + g1 + g2 + g3);
        const y = height - 22 - amp * (height - 42);
        points.push(`${x === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      const linePath = points.join(" ");
      const areaPath = `${linePath} L ${width} ${height - 22} L 0 ${height - 22} Z`;
      return { linePath, areaPath };
    };

    const activeCurve = buildCurve(f1Effective, f2Effective, f3Effective);
    const baseCurve = buildCurve(
      selectedVowel.baseF1,
      selectedVowel.baseF2,
      selectedVowel.baseF3
    );

    const hzToX = (hz: number) => Math.round((hz / maxHz) * width);

    return {
      activeCurve,
      baseCurve,
      f1X: hzToX(f1Effective),
      f2X: hzToX(f2Effective),
      f3X: hzToX(f3Effective),
      baseF1X: hzToX(selectedVowel.baseF1),
      baseF2X: hzToX(selectedVowel.baseF2),
    };
  }, [f1Effective, f2Effective, f3Effective, selectedVowel]);

  const askMaestro = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed) return;
    setQuestion(trimmed);
    setIsLoadingAsk(true);
    try {
      const res = await fetch("/api/vocal-coach/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          voiceType: selectedRegisterId.toUpperCase(),
          lowestNote: lowNoteLabel,
          highestNote: highNoteLabel,
          recentAccuracy,
        }),
      });
      const data: AiConsultationResponse = await res.json();
      setConsultation(data);
    } catch (err) {
      console.error("Failed to ask vocal coach:", err);
    } finally {
      setIsLoadingAsk(false);
    }
  };

  // Visual coordinates for Sagittal SVG nodes
  const lipProtrusionX = 54 + lipRounding * 0.7; // Smaller X = protruded forward (leftward in profile)
  const lowerLipY = 98 + lipOpening * 0.36;
  const larynxOffsetY = -larynxShift * 0.85; // Negative larynxShift = lower on screen (larger Y)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT ZONE: Interactive Vocal Tract & Formant Resonance Simulator (7 cols) */}
      <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-xl p-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <div className="text-xs text-slate-400">
              Acustica del Tratto Vocale · Manipolazione Laringe, Labbra e Formanti F1 / F2
            </div>
            <h2 className="text-xl font-semibold text-slate-100 mt-0.5">
              Simulatore Interattivo di Laringe, Labbra & Spettro Formantico
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleMicFft}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                micFftActive
                  ? "bg-rose-600 text-white"
                  : "bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30"
              }`}
            >
              {micFftActive ? (
                <MicOff className="w-3.5 h-3.5" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
              <span>
                {micFftActive
                  ? `Spettro Mic Live: ON (Squillo ${squilloPercent}%)`
                  : "Spettro Microfono Live (FFT)"}
              </span>
            </button>

            <button
              type="button"
              onClick={toggleLiveAudioDrone}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                liveAudioDrone
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 hover:bg-slate-700 text-sky-300"
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>
                {liveAudioDrone ? "Suono Continuo: ON" : "Suono Live al Tocco"}
              </span>
            </button>

            <button
              type="button"
              onClick={handleResetAnatomy}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Vowel Selector Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid grid-cols-5 gap-2 flex-1">
            {VOWEL_PRESETS.map((v) => {
              const active = v.vowel === selectedVowel.vowel;
              return (
                <button
                  key={v.vowel}
                  type="button"
                  onClick={() => handleSelectVowel(v)}
                  className={`py-2 rounded-lg font-display font-bold text-sm border transition-colors ${
                    active
                      ? "bg-sky-500 border-sky-400 text-slate-950"
                      : "bg-slate-950 border-slate-800 text-slate-200 hover:border-slate-700"
                  }`}
                >
                  Vocale /{v.vowel}/
                </button>
              );
            })}
          </div>
        </div>

        {/* DUAL INTERACTIVE SVG STAGE: 1. Sagittal Vocal Tract (Draggable Larynx & Lips) + 2. Live F1/F2 Formant Spectrum */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-[#0B1120] border border-slate-800 rounded-xl p-4 items-center">
          {/* SVG 1: Interactive Sagittal Vocal Tract with Draggable Larynx & Lip Nodes */}
          <div className="md:col-span-5 flex flex-col items-center border-b md:border-b-0 md:border-r border-slate-800/80 pb-4 md:pb-0 md:pr-3">
            <div className="flex items-center gap-1.5 text-[11px] text-sky-400 font-medium mb-1">
              <Move className="w-3.5 h-3.5" />
              <span>Trascina i nodi Labbra e Laringe sul grafico:</span>
            </div>

            <svg
              ref={tractSvgRef}
              viewBox="0 0 280 235"
              onPointerMove={handleSvgPointerMove}
              onPointerUp={handleSvgPointerUp}
              onPointerLeave={handleSvgPointerUp}
              className="w-full max-w-[260px] h-auto select-none touch-none"
              role="img"
              aria-label="Sezione anatomica interattiva del tratto vocale con controlli trascinabili per labbra e laringe"
            >
              {/* Subtle Acoustic Grid */}
              <line x1="20" y1="96" x2="260" y2="96" stroke="#1E293B" strokeDasharray="3 3" />
              <line x1="178" y1="25" x2="178" y2="220" stroke="#1E293B" strokeDasharray="3 3" />

              {/* Head & Posterior Pharyngeal Wall */}
              <path
                d="M 85 26 C 165 26, 208 55, 208 212"
                fill="none"
                stroke="#475569"
                strokeWidth="2.5"
              />

              {/* Highlighted Resonant Vocal Tract Cavity Area (Changes dynamically with Lips & Larynx!) */}
              <path
                d={`M ${lipProtrusionX} 88 Q 125 ${
                  82 - (palateElevation / 100) * 18
                }, 178 ${95 - (palateElevation / 100) * 18} L 192 ${
                  178 + larynxOffsetY
                } L 164 ${178 + larynxOffsetY} Q 145 ${
                  112 + lipOpening * 0.16
                }, ${lipProtrusionX} ${lowerLipY} Z`}
                fill="rgba(56, 189, 248, 0.14)"
                stroke="rgba(56, 189, 248, 0.35)"
                strokeWidth="1.5"
              />

              {/* Hard & Soft Palate (Velo Palatino) */}
              <path
                d={`M 75 86 Q 130 80, 178 ${105 - (palateElevation / 100) * 24}`}
                fill="none"
                stroke="#38BDF8"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <text x="82" y="72" fill="#38BDF8" fontSize="9" fontFamily="IBM Plex Mono">
                Velo ({palateElevation}%)
              </text>

              {/* Tongue & Jaw Contour */}
              <path
                d={`M ${lipProtrusionX + 8} ${lowerLipY} Q 132 ${
                  102 + lipOpening * 0.14
                }, 174 ${168 + larynxOffsetY * 0.6}`}
                fill="rgba(244, 63, 94, 0.16)"
                stroke="#FB7185"
                strokeWidth="3"
                strokeLinecap="round"
              />

              {/* Upper Lip & Interactive Draggable Lower/Protruding Lip Node */}
              <path
                d={`M 82 65 L 68 78 L ${lipProtrusionX} 88`}
                fill="none"
                stroke="#F43F5E"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <g
                className="cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDraggingTarget("lips");
                }}
              >
                <circle
                  cx={lipProtrusionX}
                  cy={lowerLipY}
                  r="10"
                  fill={draggingTarget === "lips" ? "#F43F5E" : "#FB7185"}
                  stroke="#F8FAFC"
                  strokeWidth="2"
                />
                <text
                  x={lipProtrusionX - 6}
                  y={lowerLipY + 22}
                  fill="#FDA4AF"
                  fontSize="9.5"
                  fontWeight="600"
                  fontFamily="IBM Plex Mono"
                >
                  Labbra ({lipRounding > 0 ? `+${lipRounding}` : lipRounding})
                </text>
              </g>

              {/* Interactive Draggable Larynx Box */}
              <g
                transform={`translate(0, ${larynxOffsetY})`}
                className="cursor-ns-resize"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDraggingTarget("larynx");
                }}
              >
                <rect
                  x="160"
                  y="166"
                  width="38"
                  height="24"
                  rx="6"
                  fill={
                    larynxShift > 8
                      ? "rgba(245, 158, 11, 0.35)"
                      : "rgba(16, 185, 129, 0.35)"
                  }
                  stroke={larynxShift > 8 ? "#F59E0B" : "#10B981"}
                  strokeWidth="2.5"
                />
                <circle
                  cx="179"
                  cy="178"
                  r="4"
                  fill="#F8FAFC"
                />
                <text
                  x="152"
                  y="182"
                  textAnchor="end"
                  fill={larynxShift > 8 ? "#FCD34D" : "#6EE7B7"}
                  fontSize="9.5"
                  fontWeight="600"
                  fontFamily="IBM Plex Mono"
                >
                  Laringe ({larynxShift > 0 ? `+${larynxShift}` : larynxShift}mm)
                </text>
              </g>

              {/* Vocal Tract Effective Length Indicator */}
              <text
                x="140"
                y="226"
                textAnchor="middle"
                fill="#94A3B8"
                fontSize="10"
                fontFamily="IBM Plex Mono"
              >
                Lunghezza Tratto Vocale: {tractLengthCm} cm
              </text>
            </svg>
          </div>

          {/* SVG 2: Real-Time Formant Frequency Spectrum Curve (F1, F2, F3) */}
          <div className="md:col-span-7 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-200">
                Risposta Spettrale in Tempo Reale (Picchi Formantici F1 e F2)
              </div>
              <span
                className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${
                  larynxShift <= -3 && lipRounding <= -4
                    ? "text-sky-300 border-sky-500/40 bg-sky-950/60"
                    : larynxShift >= 8
                    ? "text-amber-300 border-amber-500/40 bg-amber-950/60"
                    : "text-emerald-300 border-emerald-500/40 bg-emerald-950/60"
                }`}
              >
                {larynxShift <= -3 && lipRounding <= -4
                  ? "● TIMBRO ROTONDO / COPERTO"
                  : larynxShift >= 8
                  ? "▲ LARINGE ALTA / TIMBRO CHIARO"
                  : "● RISONANZA EQUILIBRATA"}
              </span>
            </div>

            <svg
              viewBox="0 0 460 155"
              className="w-full h-auto bg-slate-950 rounded-lg border border-slate-800/90 p-2 select-none"
              role="img"
              aria-label="Grafico spettrale in tempo reale delle frequenze formantiche F1, F2 e F3"
            >
              <defs>
                <linearGradient id="formantSpecGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.42" />
                  <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Frequency Grid Lines */}
              {[500, 1000, 1500, 2000, 2500, 3000].map((hz) => {
                const x = Math.round((hz / 3400) * 460);
                return (
                  <g key={hz}>
                    <line
                      x1={x}
                      y1="10"
                      x2={x}
                      y2="125"
                      stroke="#1E293B"
                      strokeDasharray="2 2"
                    />
                    <text
                      x={x}
                      y="142"
                      textAnchor="middle"
                      fill="#64748B"
                      fontSize="9"
                      fontFamily="IBM Plex Mono"
                    >
                      {hz}Hz
                    </text>
                  </g>
                );
              })}

              {/* Baseline Unmodified Vowel Spectrum (Dashed Reference) */}
              <path
                d={spectrumPaths.baseCurve.linePath}
                fill="none"
                stroke="#475569"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />

              {/* Active Modified Formant Envelope */}
              <path
                d={spectrumPaths.activeCurve.areaPath}
                fill="url(#formantSpecGrad)"
              />
              <path
                d={spectrumPaths.activeCurve.linePath}
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.5"
              />

              {/* Live Microphone FFT Spectrum Curve Overlay (VoceVista Mode) */}
              {micFftActive && micFftPath && (
                <path
                  d={micFftPath}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2"
                  opacity="0.95"
                />
              )}

              {/* F1 Peak Marker (Governed by Mouth Opening & Larynx Height) */}
              <line
                x1={spectrumPaths.f1X}
                y1="18"
                x2={spectrumPaths.f1X}
                y2="123"
                stroke="#38BDF8"
                strokeWidth="1.5"
              />
              <circle cx={spectrumPaths.f1X} cy="22" r="5" fill="#38BDF8" />
              <text
                x={spectrumPaths.f1X}
                y="14"
                textAnchor="middle"
                fill="#38BDF8"
                fontSize="10"
                fontWeight="700"
                fontFamily="IBM Plex Mono"
              >
                F1: {f1Effective}Hz
              </text>

              {/* F2 Peak Marker (Governed by Lip Rounding/Spreading & Tongue) */}
              <line
                x1={spectrumPaths.f2X}
                y1="30"
                x2={spectrumPaths.f2X}
                y2="123"
                stroke="#10B981"
                strokeWidth="1.5"
              />
              <circle cx={spectrumPaths.f2X} cy="34" r="5" fill="#10B981" />
              <text
                x={spectrumPaths.f2X}
                y="26"
                textAnchor="middle"
                fill="#10B981"
                fontSize="10"
                fontWeight="700"
                fontFamily="IBM Plex Mono"
              >
                F2: {f2Effective}Hz
              </text>

              {/* F3 Singer's Formant Marker */}
              <line
                x1={spectrumPaths.f3X}
                y1="45"
                x2={spectrumPaths.f3X}
                y2="123"
                stroke="#F59E0B"
                strokeWidth="1.5"
              />
              <circle cx={spectrumPaths.f3X} cy="48" r="4" fill="#F59E0B" />
              <text
                x={Math.min(425, spectrumPaths.f3X)}
                y="40"
                textAnchor="middle"
                fill="#FCD34D"
                fontSize="9.5"
                fontWeight="600"
                fontFamily="IBM Plex Mono"
              >
                F3: {f3Effective}Hz
              </text>
            </svg>

            {/* Real-Time Numeric Delta Cards for F1 & F2 */}
            <div className="grid grid-cols-3 gap-2 font-mono tabular-nums text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-400">1° Formante (F1)</div>
                <div className="text-sm font-bold text-sky-400 mt-0.5">
                  {f1Effective} Hz
                </div>
                <div className="text-[10px] text-slate-400">
                  Scarto:{" "}
                  <span className={deltaF1 >= 0 ? "text-amber-300" : "text-sky-300"}>
                    {deltaF1 >= 0 ? `+${deltaF1}` : deltaF1} Hz
                  </span>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-400">2° Formante (F2)</div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5">
                  {f2Effective} Hz
                </div>
                <div className="text-[10px] text-slate-400">
                  Scarto:{" "}
                  <span
                    className={deltaF2 >= 0 ? "text-emerald-300" : "text-sky-300"}
                  >
                    {deltaF2 >= 0 ? `+${deltaF2}` : deltaF2} Hz
                  </span>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-400">3° Formante (F3)</div>
                <div className="text-sm font-bold text-amber-300 mt-0.5">
                  {f3Effective} Hz
                </div>
                <div className="text-[10px] text-slate-400">
                  {micFftActive ? (
                    <span className="text-emerald-400 font-semibold">
                      Squillo Mic: {squilloPercent}%
                    </span>
                  ) : (
                    "Squillo / Proiezione"
                  )}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
              <strong className="text-sky-400">Effetto Acustico Attuale: </strong>
              {lipRounding < -5
                ? "Le labbra protruse in avanti allungano il tubo vocale e abbassano F2, rendendo il timbro più scuro, morbido e rotondo (utile sul passaggio)."
                : lipRounding > 6
                ? "Le labbra distese a sorriso accorciano il tratto vocale e innalzano F2, aumentando la brillantezza e la punta del suono."
                : selectedVowel.pedagogicalTip}
            </p>
          </div>
        </div>

        {/* Synchronized Precision Sliders for Larynx, Lip Rounding, Lip Opening, and Pitch */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-200 font-medium">
                1. Posizione Verticale Laringe
              </span>
              <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                {larynxShift <= -4
                  ? `Bassa/Morbida (${larynxShift} mm)`
                  : larynxShift >= 8
                  ? `Alta/Spinta (+${larynxShift} mm)`
                  : `Neutra (${larynxShift} mm)`}
              </span>
            </div>
            <input
              type="range"
              min={-20}
              max={20}
              step={1}
              value={larynxShift}
              onChange={(e) => setLarynxShift(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>-20mm (Abbassa F1/F2 · Copertura)</span>
              <span>+20mm (Alza F1/F2)</span>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-200 font-medium">
                2. Posizione Orizzontale Labbra
              </span>
              <span className="font-mono tabular-nums text-rose-300 font-semibold">
                {lipRounding <= -5
                  ? `Arrotondate (${lipRounding})`
                  : lipRounding >= 5
                  ? `Sorriso/Aperte (+${lipRounding})`
                  : `Neutre (${lipRounding})`}
              </span>
            </div>
            <input
              type="range"
              min={-20}
              max={20}
              step={1}
              value={lipRounding}
              onChange={(e) => setLipRounding(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>-20 (Protruse · Abbassa F2)</span>
              <span>+20 (Sorriso · Alza F2)</span>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-200 font-medium">
                3. Apertura Labbra & Mandibola
              </span>
              <span className="font-mono tabular-nums text-sky-400 font-semibold">
                {lipOpening}% (Modula F1)
              </span>
            </div>
            <input
              type="range"
              min={20}
              max={100}
              step={2}
              value={lipOpening}
              onChange={(e) => setLipOpening(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-200 font-medium">
                4. Nota & Cupola Palatale ({palateElevation}%)
              </span>
              <span className="font-mono tabular-nums text-sky-400 font-semibold">
                {formatMidiNote(demoMidi).fullLabel}
              </span>
            </div>
            <input
              type="range"
              min={48}
              max={72}
              step={1}
              value={demoMidi}
              onChange={(e) => setDemoMidi(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            studioAudio.playVowelFormantDemo(
              demoMidi,
              f1Effective,
              f2Effective,
              f3Effective,
              1.7
            )
          }
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors"
        >
          <Volume2 className="w-4 h-4" />
          <span>
            Ascolta Sintesi Formantica /{selectedVowel.vowel}/ (F1: {f1Effective} Hz ·
            F2: {f2Effective} Hz)
          </span>
        </button>
      </div>

      {/* RIGHT ZONE: AI Vocal Coach Consultation & Session Dossier (5 cols) */}
      <div className="lg:col-span-5 flex flex-col gap-5">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="text-xs text-sky-400 font-medium">
                Consulenza Vocale Personalizzata · Gemini AI
              </div>
              <h2 className="text-xl font-semibold text-slate-100 mt-0.5">
                Chiedi al Maestro di Canto AI
              </h2>
            </div>
            <Sliders className="w-5 h-5 text-slate-500 shrink-0" />
          </div>

          {/* Quick studio questions */}
          <div>
            <div className="text-xs text-slate-400 mb-2">
              Domande frequenti di tecnica vocale (clicca per consultare):
            </div>
            <div className="grid grid-cols-1 gap-2">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => askMaestro(q)}
                  className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 hover:border-sky-500/50 text-left text-xs text-slate-300 hover:text-slate-100 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Question Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              askMaestro(question);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Descrivi una tua difficoltà vocale o chiedi un esercizio..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              disabled={isLoadingAsk || !question.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isLoadingAsk ? "Analisi..." : "Chiedi"}</span>
            </button>
          </form>

          {/* AI Consultation Answer Card */}
          {consultation && (
            <div className="bg-slate-950 border border-sky-500/40 rounded-xl p-4 flex flex-col gap-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <h3 className="text-sm font-semibold text-sky-300">
                  {consultation.titoloRisposta}
                </h3>
                <button
                  type="button"
                  onClick={() => onPlayCoachVoice(consultation.sintesiVocale)}
                  disabled={isPlayingTts}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 whitespace-nowrap shrink-0"
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span>{isPlayingTts ? "In ascolto..." : "Ascolta Risposta"}</span>
                </button>
              </div>

              <div className="text-xs text-slate-300 leading-relaxed">
                <span className="font-semibold text-slate-100">
                  Meccanica Fisiologica:{" "}
                </span>
                {consultation.spiegazioneFisiologica}
              </div>

              <div className="text-xs text-slate-300 leading-relaxed">
                <span className="font-semibold text-emerald-400">
                  Azione Correttiva:{" "}
                </span>
                {consultation.azionePratica}
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <div className="text-xs font-semibold text-slate-200">
                  Routine Pratica Passo-Passo:
                </div>
                {consultation.routineConsigliata.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-900/90 border border-slate-800 rounded-lg p-3"
                  >
                    <div className="text-xs font-semibold text-sky-400">
                      {item.passo}
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">{item.dettaglio}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Latest Session Report Summary */}
          {lastAnalysis && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Ultima Valutazione in Palestra ({lastExerciseTitle})</span>
                <span className="font-mono text-emerald-400 font-semibold">
                  Accuratezza: {recentAccuracy === null ? "Non ancora disponibile" : `${recentAccuracy}%`}
                </span>
              </div>
              <p className="text-xs text-slate-200 font-medium">
                {lastAnalysis.valutazioneSintetica}
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 mt-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  Esercizio assegnato: {lastAnalysis.esercizioCorrettivo.titolo}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
