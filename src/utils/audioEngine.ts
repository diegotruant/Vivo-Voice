import { VocalExercise, VoiceRegisterInfo, VoiceRegisterId } from "../types/vocal";

export const NOTE_NAMES_INTL = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export const NOTE_NAMES_IT = [
  "Do",
  "Do#",
  "Re",
  "Re#",
  "Mi",
  "Fa",
  "Fa#",
  "Sol",
  "Sol#",
  "La",
  "La#",
  "Si",
];

export const VOICE_REGISTERS: VoiceRegisterInfo[] = [
  {
    id: "basso",
    name: "Basso",
    rangeLabel: "Mi2 (E2) – Mi4 (E4)",
    minMidi: 40, // E2
    maxMidi: 64, // E4
    passaggioMidi: 59, // B3
    baseExerciseMidi: 48, // C3
    description:
      "Timbro profondo e ricco di armonici gravi. Lavoro focalizzato sulla proiezione in maschera senza appesantire la massa cordale.",
  },
  {
    id: "baritono",
    name: "Baritono",
    rangeLabel: "Sol2 (G2) – Sol4 (G4)",
    minMidi: 43, // G2
    maxMidi: 67, // G4
    passaggioMidi: 62, // D4
    baseExerciseMidi: 50, // D3
    description:
      "Equilibrio tra calore medio-grave e squillo superiore. Fondamentale la copertura morbida intorno al Re4–Mi4.",
  },
  {
    id: "tenore",
    name: "Tenore",
    rangeLabel: "Do3 (C3) – Do5 (C5)",
    minMidi: 48, // C3
    maxMidi: 72, // C5
    passaggioMidi: 65, // F4
    baseExerciseMidi: 55, // G3
    description:
      "Registro brillante con zona di passaggio critica tra Fa4 e Sol4. Richiede appoggio intercostale elastico e laringe stabile.",
  },
  {
    id: "contralto",
    name: "Contralto",
    rangeLabel: "Fa3 (F3) – Fa5 (F5)",
    minMidi: 53, // F3
    maxMidi: 77, // F5
    passaggioMidi: 69, // A4
    baseExerciseMidi: 57, // A3
    description:
      "Voce femminile dal colore ambrato e vellutato nel registro di petto-misto. Focus sulla connessione fluida tra petto e testa.",
  },
  {
    id: "mezzosoprano",
    name: "Mezzosoprano",
    rangeLabel: "La3 (A3) – La5 (A5)",
    minMidi: 57, // A3
    maxMidi: 81, // A5
    passaggioMidi: 71, // B4
    baseExerciseMidi: 60, // C4
    description:
      "Grande versatilità timbrica e dinamica nel registro centrale. Ideale per sviluppare un mix omogeneo su due ottave.",
  },
  {
    id: "soprano",
    name: "Soprano",
    rangeLabel: "Do4 (C4) – Do6 (C6)",
    minMidi: 60, // C4
    maxMidi: 84, // C6
    passaggioMidi: 74, // D5
    baseExerciseMidi: 62, // D4
    description:
      "Massima lucentezza e agilità nel registro acuto e sovracuto. Focus sull'apertura del velo palatino e spazio retro-faringeo.",
  },
];

export const VOCAL_EXERCISES: VocalExercise[] = [
  {
    id: "sostenuto-appoggio",
    numberLabel: "01",
    title: "Sostenuto & Appoggio Diaframmatico",
    category: "Stabilità & Fiato",
    difficulty: "Base",
    description:
      "Note lunghe su tonica, terza e quinta per calibrare l'attacco morbido del suono (onset simultaneo) e la stabilità della colonna d'aria.",
    physiologicalFocus:
      "Espansione costo-diaframmatica costante: evita oscillazioni di pressione sottoglottica durante i 3 battiti di tenuta.",
    defaultBpm: 76,
    steps: [
      { semitoneOffset: 0, durationBeats: 3, syllable: "Ma" },
      { semitoneOffset: 4, durationBeats: 3, syllable: "Me" },
      { semitoneOffset: 7, durationBeats: 3, syllable: "Mo" },
      { semitoneOffset: 4, durationBeats: 3, syllable: "Me" },
      { semitoneOffset: 0, durationBeats: 4, syllable: "Ma" },
    ],
  },
  {
    id: "triade-risonanza",
    numberLabel: "02",
    title: "Triade Maggiore in Maschera (1-3-5-3-1)",
    category: "Intonazione & Risonanza",
    difficulty: "Base",
    description:
      "Il classico arpeggio su triade maggiore Do-Mi-Sol-Mi-Do per proiettare il suono negli zigomi mantenendo la gola rilassata.",
    physiologicalFocus:
      "Consonante nasale 'N' + vocale aperta per guidare gli armonici verso il palato duro senza stringere la mandibola.",
    defaultBpm: 92,
    steps: [
      { semitoneOffset: 0, durationBeats: 1.5, syllable: "No" },
      { semitoneOffset: 4, durationBeats: 1.5, syllable: "Na" },
      { semitoneOffset: 7, durationBeats: 2, syllable: "No" },
      { semitoneOffset: 4, durationBeats: 1.5, syllable: "Na" },
      { semitoneOffset: 0, durationBeats: 2.5, syllable: "No" },
    ],
  },
  {
    id: "scala-cinque-note",
    numberLabel: "03",
    title: "Scala di Quinta Legato (1-2-3-4-5-4-3-2-1)",
    category: "Legato & Omogeneità",
    difficulty: "Intermedio",
    description:
      "Gradi congiunti ascendenti e discendenti per unire le note in un unico flusso d'aria continuo senza scalini laringei.",
    physiologicalFocus:
      "Mantieni la stessa identica posizione verticale della laringe mentre sali dal primo al quinto grado.",
    defaultBpm: 100,
    steps: [
      { semitoneOffset: 0, durationBeats: 1, syllable: "Vi" },
      { semitoneOffset: 2, durationBeats: 1, syllable: "Ve" },
      { semitoneOffset: 4, durationBeats: 1, syllable: "Va" },
      { semitoneOffset: 5, durationBeats: 1, syllable: "Vo" },
      { semitoneOffset: 7, durationBeats: 2, syllable: "Vu" },
      { semitoneOffset: 5, durationBeats: 1, syllable: "Vo" },
      { semitoneOffset: 4, durationBeats: 1, syllable: "Va" },
      { semitoneOffset: 2, durationBeats: 1, syllable: "Ve" },
      { semitoneOffset: 0, durationBeats: 2.5, syllable: "Vi" },
    ],
  },
  {
    id: "passaggio-mix-ottava",
    numberLabel: "04",
    title: "Ponte sul Passaggio & Voce Mista (1-5-8-5-1)",
    category: "Passaggio di Registro",
    difficulty: "Intermedio",
    description:
      "Salti di quinta e ottava pensati per alleggerire la massa vocale ed entrare in registro misto (Mix Voice) senza spingere di gola.",
    physiologicalFocus:
      "Sull'ottava superiore usa la vocale stretta 'U' o 'I' sollevando il velo palatino come in un piccolo sbadiglio.",
    defaultBpm: 88,
    steps: [
      { semitoneOffset: 0, durationBeats: 1.5, syllable: "Mu" },
      { semitoneOffset: 7, durationBeats: 1.5, syllable: "Mi" },
      { semitoneOffset: 12, durationBeats: 2.5, syllable: "Mu" },
      { semitoneOffset: 7, durationBeats: 1.5, syllable: "Mi" },
      { semitoneOffset: 0, durationBeats: 2.5, syllable: "Ma" },
    ],
  },
  {
    id: "agilita-belcanto",
    numberLabel: "05",
    title: "Agilità Belcantistica & Fioritura",
    category: "Agilità & Controllo",
    difficulty: "Avanzato",
    description:
      "Disegno melodico rapido 1-3-2-4-3-5-4-2-1 per sviluppare flessibilità glottica, precisione d'intonazione e indipendenza diaframmatica.",
    physiologicalFocus:
      "Articolazione rapida e precisa ma leggera: il cambio di nota avviene nella glottide mentre il torace resta fermo e nobile.",
    defaultBpm: 112,
    steps: [
      { semitoneOffset: 0, durationBeats: 1, syllable: "La" },
      { semitoneOffset: 4, durationBeats: 1, syllable: "Le" },
      { semitoneOffset: 2, durationBeats: 1, syllable: "Li" },
      { semitoneOffset: 5, durationBeats: 1, syllable: "Lo" },
      { semitoneOffset: 4, durationBeats: 1, syllable: "Lu" },
      { semitoneOffset: 7, durationBeats: 1.5, syllable: "La" },
      { semitoneOffset: 5, durationBeats: 1, syllable: "Lo" },
      { semitoneOffset: 2, durationBeats: 1, syllable: "Le" },
      { semitoneOffset: 0, durationBeats: 2.5, syllable: "La" },
    ],
  },
];

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidiFloat(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function formatMidiNote(midi: number): {
  noteIt: string;
  noteIntl: string;
  fullLabel: string;
  freq: number;
  isBlackKey: boolean;
} {
  const rounded = Math.round(midi);
  const noteIdx = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  const noteIt = `${NOTE_NAMES_IT[noteIdx]}${octave}`;
  const noteIntl = `${NOTE_NAMES_INTL[noteIdx]}${octave}`;
  const isBlackKey = [1, 3, 6, 8, 10].includes(noteIdx);
  return {
    noteIt,
    noteIntl,
    fullLabel: `${noteIt} (${noteIntl})`,
    freq: midiToFreq(rounded),
    isBlackKey,
  };
}

export interface PitchDetectOptions {
  /** Lowest detectable frequency in Hz (default 65 Hz, C2). Use ~30 Hz for vocal fry. */
  minFreq?: number;
  /** Highest detectable frequency in Hz (default 1150 Hz). */
  maxFreq?: number;
  /** Minimum periodicity (0–1) to accept a pitch (default 0.45). */
  clarityThreshold?: number;
}

/**
 * Pitch detector based on the McLeod Normalized Square Difference Function (NSDF):
 * an autocorrelation normalized for the shrinking overlap at each lag, so clarity stays
 * near 1 for clean periodic tones at any pitch, with parabolic interpolation for
 * sub-cent precision.
 *
 * The buffer must contain at least 2 periods of the lowest frequency of interest:
 * length >= 2 * sampleRate / minFreq (e.g. 2048 samples cover 65 Hz at 48 kHz;
 * vocal fry at 30 Hz needs 4096 samples at 48 kHz). Lower frequencies than the buffer
 * allows are simply not detected.
 *
 * Returns null if the signal RMS is below the noise floor or periodicity is weak.
 */
export function detectPitchAutocorrelation(
  buffer: Float32Array,
  sampleRate: number,
  options: PitchDetectOptions = {}
): { freq: number; rms: number; clarity: number } | null {
  const minFreq = options.minFreq ?? 65;
  const maxFreq = options.maxFreq ?? 1150;
  const clarityThreshold = options.clarityThreshold ?? 0.45;

  const size = buffer.length;
  let sumSquares = 0;
  for (let i = 0; i < size; i++) {
    sumSquares += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sumSquares / size);

  // Noise gate threshold
  if (rms < 0.012) {
    return null;
  }
  if (size < 64) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  // At least two periods must fit in the buffer
  const maxLag = Math.min(Math.floor(size / 2), Math.ceil(sampleRate / minFreq));
  if (maxLag <= minLag + 2) return null;

  // NSDF: n(τ) = 2·Σ x[j]x[j+τ] / Σ (x[j]² + x[j+τ]²), j over the overlap
  const nsdf = new Float32Array(maxLag + 2);
  for (let lag = 0; lag <= maxLag + 1; lag++) {
    let acf = 0;
    let energy = 0;
    const end = size - lag;
    for (let j = 0; j < end; j++) {
      const a = buffer[j];
      const b = buffer[j + lag];
      acf += a * b;
      energy += a * a + b * b;
    }
    nsdf[lag] = energy > 0 ? (2 * acf) / energy : 0;
  }

  // Key maxima: highest point between each positive-going and negative-going zero crossing
  const peaks: number[] = [];
  let lag = 1;
  while (lag <= maxLag && nsdf[lag] > 0) lag++; // skip the zero-lag lobe
  while (lag <= maxLag) {
    while (lag <= maxLag && nsdf[lag] <= 0) lag++;
    let best = -1;
    while (lag <= maxLag && nsdf[lag] > 0) {
      if (lag >= minLag && (best === -1 || nsdf[lag] > nsdf[best])) best = lag;
      lag++;
    }
    if (best !== -1) peaks.push(best);
  }
  if (peaks.length === 0) return null;

  let highest = 0;
  for (const p of peaks) highest = Math.max(highest, nsdf[p]);
  // First key maximum close to the highest one: avoids picking a multiple of the period (octave error)
  const maxPos = peaks.find((p) => nsdf[p] >= 0.9 * highest) ?? peaks[0];

  // Parabolic interpolation around the peak
  let T0 = maxPos;
  let clarity = nsdf[maxPos];
  if (maxPos > 0 && maxPos < maxLag + 1) {
    const x1 = nsdf[maxPos - 1];
    const x2 = nsdf[maxPos];
    const x3 = nsdf[maxPos + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a < 0) {
      T0 = maxPos - b / (2 * a);
      clarity = Math.min(1, x2 - (b * b) / (4 * a));
    }
  }

  if (clarity < clarityThreshold) return null;
  const freq = sampleRate / T0;
  if (freq < minFreq || freq > maxFreq) return null;

  return { freq, rms, clarity };
}

/**
 * Studio Web Audio Synthesizer for playing warm piano reference notes,
 * sustained exercise accompaniment, and vowel formant synthesis.
 */
class StudioAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private activeSustainOscs: OscillatorNode[] = [];
  private activeSustainGain: GainNode | null = null;
  /** Every oscillator this synthesizer has started and that has not ended yet (for stopAll). */
  private liveOscs = new Set<OscillatorNode>();

  private trackOsc(osc: OscillatorNode): void {
    this.liveOscs.add(osc);
    osc.addEventListener("ended", () => this.liveOscs.delete(osc));
  }

  public getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Plays a warm acoustic-style piano reference tone for a given MIDI note
   */
  public playPianoNote(midi: number, durationSec = 0.85, volume = 0.35): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const freq = midiToFreq(midi);

    const masterGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq * 4.5, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.6, now + durationSec);

    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(volume, now + 0.018);
    masterGain.gain.exponentialRampToValueAtTime(volume * 0.45, now + durationSec * 0.4);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    // 3 partials for rich piano warmth
    const partials = [
      { ratio: 1, amp: 0.65, type: "triangle" as OscillatorType },
      { ratio: 2, amp: 0.25, type: "sine" as OscillatorType },
      { ratio: 3, amp: 0.1, type: "sine" as OscillatorType },
    ];

    partials.forEach((p) => {
      const osc = ctx.createOscillator();
      this.trackOsc(osc);
      const pGain = ctx.createGain();
      osc.type = p.type;
      osc.frequency.setValueAtTime(freq * p.ratio, now);
      pGain.gain.setValueAtTime(p.amp, now);
      osc.connect(pGain);
      pGain.connect(filter);
      osc.start(now);
      osc.stop(now + durationSec + 0.05);
    });

    filter.connect(masterGain);
    masterGain.connect(ctx.destination);
  }

  /**
   * Plays a subtle studio metronome click
   */
  public playMetronomeTick(isDownbeat = false, volume = 0.2): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    this.trackOsc(osc);
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(isDownbeat ? 1100 : 780, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Synthesizes a vocal vowel sound using glottal harmonics + F1/F2/F3 Formant Biquad Filters
   * so students can hear the acoustic difference between vowels and larynx positions.
   */
  public playVowelFormantDemo(
    midi: number,
    f1Hz: number,
    f2Hz: number,
    f3Hz: number,
    durationSec = 1.6
  ): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const fundamental = midiToFreq(midi);

    // Glottal source (sawtooth with natural 5.5Hz vibrato)
    const sourceOsc = ctx.createOscillator();
    this.trackOsc(sourceOsc);
    sourceOsc.type = "sawtooth";
    sourceOsc.frequency.setValueAtTime(fundamental, now);

    const vibratoOsc = ctx.createOscillator();

    this.trackOsc(vibratoOsc);
    const vibratoGain = ctx.createGain();
    vibratoOsc.frequency.setValueAtTime(5.4, now);
    vibratoGain.gain.setValueAtTime(fundamental * 0.012, now);
    vibratoOsc.connect(vibratoGain);
    vibratoGain.connect(sourceOsc.frequency);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.28, now + 0.08);
    masterGain.gain.setValueAtTime(0.28, now + durationSec - 0.15);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    const formants = [
      { freq: f1Hz, q: 7, gain: 1.0 },
      { freq: f2Hz, q: 9, gain: 0.65 },
      { freq: f3Hz, q: 11, gain: 0.3 },
    ];

    formants.forEach((f) => {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(f.freq, now);
      bp.Q.setValueAtTime(f.q, now);

      const fGain = ctx.createGain();
      fGain.gain.setValueAtTime(f.gain, now);

      sourceOsc.connect(bp);
      bp.connect(fGain);
      fGain.connect(masterGain);
    });

    masterGain.connect(ctx.destination);
    sourceOsc.start(now);
    vibratoOsc.start(now);
    sourceOsc.stop(now + durationSec + 0.05);
    vibratoOsc.stop(now + durationSec + 0.05);
  }

  /**
   * Synthesizes a realistic low-frequency Vocal Fry (M0 glottal pulse train, ~42 Hz)
   * optionally transitioning smoothly into a soft sustained hum at targetMidi.
   */
  public playVocalFryDemo(targetMidi: number, transitionToNote = false): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const durationSec = transitionToNote ? 2.6 : 2.0;

    const osc = ctx.createOscillator();

    this.trackOsc(osc);
    osc.type = "sawtooth";

    if (transitionToNote) {
      // Start at 42 Hz vocal fry creak for 1.1s, then glide smoothly into targetMidi
      osc.frequency.setValueAtTime(42, now);
      osc.frequency.setValueAtTime(45, now + 1.0);
      osc.frequency.exponentialRampToValueAtTime(midiToFreq(targetMidi), now + 1.55);
    } else {
      // Gentle vocal fry pulse modulation between 38 Hz and 48 Hz
      osc.frequency.setValueAtTime(40, now);
      osc.frequency.linearRampToValueAtTime(47, now + 0.9);
      osc.frequency.linearRampToValueAtTime(38, now + durationSec);
    }

    // Formant bandpass to give warm pharyngeal vocal tract color
    const formant1 = ctx.createBiquadFilter();
    formant1.type = "bandpass";
    formant1.frequency.setValueAtTime(520, now);
    formant1.Q.setValueAtTime(5.5, now);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(1400, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.26, now + 0.08);
    masterGain.gain.setValueAtTime(0.24, now + durationSec - 0.2);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(formant1);
    formant1.connect(lowpass);
    lowpass.connect(masterGain);
    masterGain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.05);
  }

  /**
   * Synthesizes a Lip Trill ("Brrrr") siren with ~25 Hz labial amplitude/frequency flutter
   * gliding smoothly up a 5th or Octave and back down.
   */
  public playLipTrillDemo(rootMidi: number, intervalSemitones = 7): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const durationSec = 2.6;
    const startFreq = midiToFreq(rootMidi);
    const peakFreq = midiToFreq(rootMidi + intervalSemitones);

    const voiceOsc = ctx.createOscillator();

    this.trackOsc(voiceOsc);
    voiceOsc.type = "triangle";
    voiceOsc.frequency.setValueAtTime(startFreq, now);
    voiceOsc.frequency.exponentialRampToValueAtTime(
      peakFreq,
      now + durationSec * 0.48
    );
    voiceOsc.frequency.exponentialRampToValueAtTime(
      startFreq,
      now + durationSec * 0.95
    );

    // 25 Hz lip-flutter modulator (simulating relaxed vibrating lips)
    const flutterOsc = ctx.createOscillator();
    this.trackOsc(flutterOsc);
    flutterOsc.type = "sine";
    flutterOsc.frequency.setValueAtTime(25, now);

    const flutterFreqDepth = ctx.createGain();
    flutterFreqDepth.gain.setValueAtTime(8, now);
    flutterOsc.connect(flutterFreqDepth);
    flutterFreqDepth.connect(voiceOsc.frequency);

    // Amplitude flutter node
    const ampModGain = ctx.createGain();
    ampModGain.gain.setValueAtTime(0.25, now);
    const flutterAmpDepth = ctx.createGain();
    flutterAmpDepth.gain.setValueAtTime(0.12, now);
    flutterOsc.connect(flutterAmpDepth);
    flutterAmpDepth.connect(ampModGain.gain);

    // Warm semi-occluded lowpass filter
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(950, now);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.001, now);
    envelope.gain.linearRampToValueAtTime(0.85, now + 0.1);
    envelope.gain.setValueAtTime(0.85, now + durationSec - 0.2);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    voiceOsc.connect(filter);
    filter.connect(ampModGain);
    ampModGain.connect(envelope);
    envelope.connect(ctx.destination);

    voiceOsc.start(now);
    flutterOsc.start(now);
    voiceOsc.stop(now + durationSec + 0.05);
    flutterOsc.stop(now + durationSec + 0.05);
  }

  private liveFormantSource: OscillatorNode | null = null;
  private liveFormantVibrato: OscillatorNode | null = null;
  private liveFormantFilters: BiquadFilterNode[] = [];
  private liveFormantGain: GainNode | null = null;

  public startLiveFormant(
    midi: number,
    f1Hz: number,
    f2Hz: number,
    f3Hz: number
  ): void {
    this.stopLiveFormant();
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const fundamental = midiToFreq(midi);

    const sourceOsc = ctx.createOscillator();

    this.trackOsc(sourceOsc);
    sourceOsc.type = "sawtooth";
    sourceOsc.frequency.setValueAtTime(fundamental, now);

    const vibratoOsc = ctx.createOscillator();

    this.trackOsc(vibratoOsc);
    const vibratoGain = ctx.createGain();
    vibratoOsc.frequency.setValueAtTime(5.3, now);
    vibratoGain.gain.setValueAtTime(fundamental * 0.011, now);
    vibratoOsc.connect(vibratoGain);
    vibratoGain.connect(sourceOsc.frequency);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.24, now + 0.06);

    const specs = [
      { freq: f1Hz, q: 7.5, gain: 1.0 },
      { freq: f2Hz, q: 9.5, gain: 0.7 },
      { freq: f3Hz, q: 11.0, gain: 0.35 },
    ];

    const filters: BiquadFilterNode[] = [];
    specs.forEach((s) => {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(s.freq, now);
      bp.Q.setValueAtTime(s.q, now);

      const fGain = ctx.createGain();
      fGain.gain.setValueAtTime(s.gain, now);

      sourceOsc.connect(bp);
      bp.connect(fGain);
      fGain.connect(masterGain);
      filters.push(bp);
    });

    masterGain.connect(ctx.destination);
    sourceOsc.start(now);
    vibratoOsc.start(now);

    this.liveFormantSource = sourceOsc;
    this.liveFormantVibrato = vibratoOsc;
    this.liveFormantFilters = filters;
    this.liveFormantGain = masterGain;
  }

  public updateLiveFormant(
    midi: number,
    f1Hz: number,
    f2Hz: number,
    f3Hz: number
  ): void {
    if (!this.liveFormantSource || this.liveFormantFilters.length < 3) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;
    this.liveFormantSource.frequency.setTargetAtTime(
      midiToFreq(midi),
      now,
      0.03
    );
    this.liveFormantFilters[0].frequency.setTargetAtTime(f1Hz, now, 0.03);
    this.liveFormantFilters[1].frequency.setTargetAtTime(f2Hz, now, 0.03);
    this.liveFormantFilters[2].frequency.setTargetAtTime(f3Hz, now, 0.03);
  }

  public stopLiveFormant(): void {
    // Capture the current nodes: a new live formant may be started before the timeout fires
    // and must not be stopped by it.
    const source = this.liveFormantSource;
    const vibrato = this.liveFormantVibrato;
    const gain = this.liveFormantGain;
    this.liveFormantSource = null;
    this.liveFormantVibrato = null;
    this.liveFormantFilters = [];
    this.liveFormantGain = null;
    if (!source && !vibrato && !gain) return;

    if (gain && this.ctx) {
      try {
        gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.03);
      } catch {
        // ignore
      }
    }
    setTimeout(() => {
      for (const node of [source, vibrato]) {
        try {
          node?.stop();
        } catch {
          // already stopped
        }
      }
      try {
        gain?.disconnect();
      } catch {
        // ignore
      }
    }, 120);
  }

  /** Stops every sound this synthesizer is playing (notes, demos, sustained tones, live formant). */
  public stopAll(): void {
    this.stopLiveFormant();
    this.liveOscs.forEach((o) => {
      try {
        o.stop();
      } catch {
        // ignore already stopped
      }
    });
    this.liveOscs.clear();
    this.activeSustainOscs = [];
    if (this.activeSustainGain) {
      try {
        this.activeSustainGain.disconnect();
      } catch {
        // ignore
      }
      this.activeSustainGain = null;
    }
  }
}

export const studioAudio = new StudioAudioSynthesizer();

/**
 * Computes scientific Vibrato Rate (Hz) and Vibrato Extent (±cents)
 * from a rolling window of PitchTelemetryPoints (~1.2 seconds).
 */
export function analyzeVibratoFromPoints(
  points: Array<{ timestamp: number; detectedMidiFloat: number | null }>
): {
  rateHz: number;
  extentCents: number;
  statusLabel: string;
  isNominal: boolean;
} {
  const valid = points.filter((p) => p.detectedMidiFloat !== null) as Array<{
    timestamp: number;
    detectedMidiFloat: number;
  }>;

  if (valid.length < 14) {
    return {
      rateHz: 0,
      extentCents: 0,
      statusLabel: "○ IN ATTESA TENUTA",
      isNominal: false,
    };
  }

  const recent = valid.slice(-45);
  const durationSec =
    (recent[recent.length - 1].timestamp - recent[0].timestamp) / 1000;
  if (durationSec < 0.35) {
    return {
      rateHz: 0,
      extentCents: 0,
      statusLabel: "○ IN ATTESA TENUTA",
      isNominal: false,
    };
  }

  const meanMidi =
    recent.reduce((acc, p) => acc + p.detectedMidiFloat, 0) / recent.length;
  const deviationsCents = recent.map(
    (p) => (p.detectedMidiFloat - meanMidi) * 100
  );

  // Count zero crossings around the mean pitch
  let zeroCrossings = 0;
  let sumAbsDev = 0;
  for (let i = 1; i < deviationsCents.length; i++) {
    sumAbsDev += Math.abs(deviationsCents[i]);
    if (
      (deviationsCents[i - 1] < 0 && deviationsCents[i] >= 0) ||
      (deviationsCents[i - 1] > 0 && deviationsCents[i] <= 0)
    ) {
      zeroCrossings++;
    }
  }

  const avgExtentCents = Math.round((sumAbsDev / deviationsCents.length) * 1.57);
  const rateHz = +(zeroCrossings / (2 * durationSec)).toFixed(1);

  if (avgExtentCents < 10) {
    return {
      rateHz: 0,
      extentCents: avgExtentCents,
      statusLabel: "● VOCE DRITTA (STRAIGHT)",
      isNominal: true,
    };
  }

  if (rateHz >= 4.8 && rateHz <= 7.0 && avgExtentCents <= 85) {
    return {
      rateHz,
      extentCents: avgExtentCents,
      statusLabel: "● VIBRATO NATURALE",
      isNominal: true,
    };
  }

  if (rateHz > 7.0) {
    return {
      rateHz,
      extentCents: avgExtentCents,
      statusLabel: "▲ TREMOLO RAPIDO",
      isNominal: false,
    };
  }

  return {
    rateHz,
    extentCents: avgExtentCents,
    statusLabel: "▲ OSCILLAZIONE LENTA",
    isNominal: false,
  };
}

/**
 * Encodes a Web Audio API AudioBuffer into a downloadable 16-bit PCM WAV Blob.
 */
export function encodeAudioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2;
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + length, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true); // 16-bit
  writeStr(36, "data");
  view.setUint32(40, length, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/**
 * Processes a raw vocal AudioBuffer through an AI-guided Pitch Correction & Mastering Chain
 * (Granular pitch-nudging toward target scale degrees + High-pass + 3kHz Singer's Formant EQ + Optical Compression + Studio Reverb).
 */
export async function processVocalBufferWithAiMastering(
  rawVocalBuffer: AudioBuffer,
  options: {
    pitchCorrectionPercent: number; // 0 to 100
    eqPresenceDb: number; // 0 to 8 dB
    compressionRatio: number; // 1.5 to 8
    reverbWetPercent: number; // 0 to 50
  }
): Promise<AudioBuffer> {
  const sampleRate = rawVocalBuffer.sampleRate;
  const length = rawVocalBuffer.length;

  // Step 1: Time-domain granular pitch-centering pass on mono vocal signal
  const inputData = rawVocalBuffer.getChannelData(0);
  const pitchCorrectedData = new Float32Array(length);
  const windowSize = 2048;
  const hopSize = 1024;
  const strength = Math.max(0, Math.min(1, options.pitchCorrectionPercent / 100));

  if (strength > 0.05) {
    for (let start = 0; start < length; start += hopSize) {
      const end = Math.min(length, start + windowSize);
      const slice = inputData.subarray(start, end);
      let pitchShiftRatio = 1.0;

      if (slice.length === windowSize) {
        const detected = detectPitchAutocorrelation(slice, sampleRate);
        if (detected) {
          const midiFloat = freqToMidiFloat(detected.freq);
          const nearestSemitone = Math.round(midiFloat);
          const targetMidi =
            midiFloat + (nearestSemitone - midiFloat) * strength;
          const targetFreq = midiToFreq(targetMidi);
          pitchShiftRatio = Math.max(
            0.92,
            Math.min(1.08, targetFreq / detected.freq)
          );
        }
      }

      // Resample grain with Hanning crossfade window
      for (let i = 0; i < end - start; i++) {
        const readIdx = start + i * pitchShiftRatio;
        const idx0 = Math.min(length - 1, Math.floor(readIdx));
        const idx1 = Math.min(length - 1, idx0 + 1);
        const frac = readIdx - idx0;
        const sample = inputData[idx0] * (1 - frac) + inputData[idx1] * frac;
        const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (end - start)));
        pitchCorrectedData[start + i] += sample * hann;
      }
    }
  } else {
    pitchCorrectedData.set(inputData);
  }

  // Step 2: OfflineAudioContext Mastering Chain (High-Pass + Formant Presence EQ + Compressor + Studio Reverb)
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
  const workBuffer = offlineCtx.createBuffer(1, length, sampleRate);
  workBuffer.copyToChannel(pitchCorrectedData, 0);

  const source = offlineCtx.createBufferSource();
  source.buffer = workBuffer;

  // 85 Hz De-rumble High-pass
  const highpass = offlineCtx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 85;

  // 3000 Hz Singer's Formant / Presence EQ Boost
  const presenceEq = offlineCtx.createBiquadFilter();
  presenceEq.type = "peaking";
  presenceEq.frequency.value = 3000;
  presenceEq.Q.value = 1.4;
  presenceEq.gain.value = options.eqPresenceDb;

  // Warmth 220 Hz body
  const warmthEq = offlineCtx.createBiquadFilter();
  warmthEq.type = "peaking";
  warmthEq.frequency.value = 220;
  warmthEq.Q.value = 1.0;
  warmthEq.gain.value = 1.8;

  // Vocal Optical Compressor
  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.threshold.value = -22;
  compressor.knee.value = 12;
  compressor.ratio.value = options.compressionRatio;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.18;

  // Dry / Wet Reverb Convolver
  const dryGain = offlineCtx.createGain();
  const wetGain = offlineCtx.createGain();
  const wetRatio = Math.max(0, Math.min(0.5, options.reverbWetPercent / 100));
  dryGain.gain.value = 1.0;
  wetGain.gain.value = wetRatio;

  // Synthesize a clean 1.6s Stereo Plate Reverb Impulse Response
  const irLength = Math.floor(sampleRate * 1.6);
  const irBuffer = offlineCtx.createBuffer(2, irLength, sampleRate);
  for (let c = 0; c < 2; c++) {
    const chData = irBuffer.getChannelData(c);
    for (let i = 0; i < irLength; i++) {
      const decay = Math.exp((-3.8 * i) / irLength);
      chData[i] = (Math.random() * 2 - 1) * decay * 0.45;
    }
  }
  const convolver = offlineCtx.createConvolver();
  convolver.buffer = irBuffer;

  source.connect(highpass);
  highpass.connect(warmthEq);
  warmthEq.connect(presenceEq);
  presenceEq.connect(compressor);

  compressor.connect(dryGain);
  dryGain.connect(offlineCtx.destination);

  compressor.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(offlineCtx.destination);

  source.start(0);
  return await offlineCtx.startRendering();
}

/**
 * Generates a built-in stereo studio instrumental stem (16 seconds, C Major - A minor - F Major - G Major)
 * so the user can test multi-stem singing, AI vocal correction, and full mix export immediately.
 */
export async function createStudioBackingStemBuffer(
  stemType: "harmony" | "rhythm"
): Promise<AudioBuffer> {
  const sampleRate = 44100;
  const durationSec = 16;
  const offline = new OfflineAudioContext(
    2,
    sampleRate * durationSec,
    sampleRate
  );

  // 4 chords, 4 seconds each (8 beats at 120 BPM)
  const chords = [
    { root: 48, triad: [60, 64, 67] }, // Do Maggiore (C)
    { root: 45, triad: [57, 60, 64] }, // La Minore (Am)
    { root: 41, triad: [53, 57, 60] }, // Fa Maggiore (F)
    { root: 43, triad: [55, 59, 62] }, // Sol Maggiore (G)
  ];

  chords.forEach((ch, chordIdx) => {
    const startSec = chordIdx * 4;
    if (stemType === "harmony") {
      ch.triad.forEach((midiNote) => {
        const osc = offline.createOscillator();
        const gain = offline.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(midiToFreq(midiNote), startSec);
        gain.gain.setValueAtTime(0.001, startSec);
        gain.gain.linearRampToValueAtTime(0.08, startSec + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.02, startSec + 3.85);
        gain.gain.linearRampToValueAtTime(0.0001, startSec + 3.98);
        osc.connect(gain);
        gain.connect(offline.destination);
        osc.start(startSec);
        osc.stop(startSec + 4);
      });
    } else {
      // Rhythm & Bass pulse every 0.5s (120 BPM)
      for (let beat = 0; beat < 8; beat++) {
        const t = startSec + beat * 0.5;
        const bassOsc = offline.createOscillator();
        const bassGain = offline.createGain();
        bassOsc.type = "sine";
        bassOsc.frequency.setValueAtTime(midiToFreq(ch.root), t);
        bassGain.gain.setValueAtTime(0.16, t);
        bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        bassOsc.connect(bassGain);
        bassGain.connect(offline.destination);
        bassOsc.start(t);
        bassOsc.stop(t + 0.45);
      }
    }
  });

  return await offline.startRendering();
}

