import assert from "node:assert/strict";
import test from "node:test";

import {
  detectPitchAutocorrelation,
  formatMidiNote,
  freqToMidiFloat,
  midiToFreq,
} from "../src/utils/audioEngine.ts";

const SAMPLE_RATE = 44_100;
const WINDOW_SIZE = 2_048;

function makeTone(frequency: number, amplitude = 0.35): Float32Array {
  return Float32Array.from(
    { length: WINDOW_SIZE },
    (_, index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE)
  );
}

test("MIDI A4 maps to 440 Hz and back", () => {
  assert.ok(Math.abs(midiToFreq(69) - 440) < 1e-9);
  assert.ok(Math.abs(freqToMidiFloat(440) - 69) < 1e-9);
});

test("note formatter returns the expected Italian and international labels", () => {
  const note = formatMidiNote(60);
  assert.equal(note.noteIt, "Do4");
  assert.equal(note.noteIntl, "C4");
  assert.ok(Math.abs(note.freq - 261.625565) < 0.01);
});

test("pitch detector estimates common singing fundamentals", () => {
  for (const expectedHz of [110, 220, 440]) {
    const result = detectPitchAutocorrelation(makeTone(expectedHz), SAMPLE_RATE);
    assert.ok(result, `expected a pitch estimate for ${expectedHz} Hz`);
    assert.ok(
      Math.abs(result.freq - expectedHz) < 3,
      `expected ${expectedHz} Hz, received ${result.freq.toFixed(2)} Hz`
    );
    assert.ok(result.clarity >= 0.45);
  }
});

test("pitch detector rejects silence", () => {
  const silence = new Float32Array(WINDOW_SIZE);
  assert.equal(detectPitchAutocorrelation(silence, SAMPLE_RATE), null);
});

test("pitch detector rejects signals below its configured noise floor", () => {
  const quietTone = makeTone(220, 0.005);
  assert.equal(detectPitchAutocorrelation(quietTone, SAMPLE_RATE), null);
});
