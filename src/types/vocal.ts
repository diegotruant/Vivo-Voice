export type VoiceRegisterId =
  | "basso"
  | "baritono"
  | "tenore"
  | "contralto"
  | "mezzosoprano"
  | "soprano";

export interface VoiceRegisterInfo {
  id: VoiceRegisterId;
  name: string;
  rangeLabel: string;
  minMidi: number;
  maxMidi: number;
  passaggioMidi: number;
  baseExerciseMidi: number; // Comfortable starting root note for exercises
  description: string;
}

export interface ExerciseStep {
  semitoneOffset: number; // Offset from exercise root MIDI note
  durationBeats: number; // Duration in beats
  syllable: string; // e.g., "Ma", "Me", "Mi", "Do", "Sol"
}

export interface VocalExercise {
  id: string;
  numberLabel: string;
  title: string;
  category: string;
  difficulty: "Base" | "Intermedio" | "Avanzato";
  description: string;
  physiologicalFocus: string;
  defaultBpm: number;
  steps: ExerciseStep[];
}

export interface PitchTelemetryPoint {
  timestamp: number;
  elapsedSec: number;
  detectedFreq: number | null;
  detectedMidiFloat: number | null;
  nearestMidi: number | null;
  centsOff: number | null;
  targetMidi: number | null;
  rmsVolume: number;
  isOnTarget: boolean;
}

export interface NoteDetails {
  midi: number;
  noteLatin: string; // e.g. "Do4"
  noteIntl: string; // e.g. "C4"
  freq: number;
  octave: number;
  isSharp: boolean;
}

export interface AiAnalysisResult {
  valutazioneSintetica: string;
  diagnosiIntonazione: string;
  consiglioAnatomico: string;
  esercizioCorrettivo: {
    titolo: string;
    istruzioni: string;
    obiettivo: string;
  };
  messaggioVocale: string;
  isFallback?: boolean;
}

export interface AiConsultationResponse {
  titoloRisposta: string;
  spiegazioneFisiologica: string;
  azionePratica: string;
  routineConsigliata: Array<{
    passo: string;
    dettaglio: string;
  }>;
  sintesiVocale: string;
  isFallback?: boolean;
}

export interface VocalSessionRecord {
  id: string;
  dateLabel: string;
  fullDate: string;
  exerciseTitle: string;
  category: string;
  registerName: string;
  accuracyPercent: number;
  stabilityPercent: number;
  avgCentsDeviation: number;
  durationMin: number;
  coachNote?: string;
}

/** Training modules a song-analysis weak point can link to (must match App tab ids). */
export const TRAINING_MODULE_IDS = [
  "diaframma",
  "riscaldamento",
  "solfeggio",
  "palestra",
] as const;
export type TrainingModuleId = (typeof TRAINING_MODULE_IDS)[number];

export function isTrainingModuleId(v: unknown): v is TrainingModuleId {
  return typeof v === "string" && (TRAINING_MODULE_IDS as readonly string[]).includes(v);
}

export interface SongDiagnosticResponse {
  sintesiPerformance: string;
  puntiDiForza: Array<{
    titolo: string;
    dettaglio: string;
  }>;
  puntiDeboliDaAllenare: Array<{
    problema: string;
    causaFisiologica: string;
    esercizioConsigliato: string;
    moduloApp: TrainingModuleId;
  }>;
  presetCorrezioneAi: {
    pitchCorrectionPercent: number;
    eqPresenceDb: number;
    compressionRatio: number;
    reverbWetPercent: number;
    motivazioneSoundEngineer: string;
  };
  messaggioVocaleCoach: string;
  isFallback?: boolean;
}

