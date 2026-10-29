# Vivo-Voice — Engineering plan to production readiness

## Mission

Turn Vivo-Voice from a promising prototype into a dependable Italian-first singing-learning product. Every user-facing metric must be traceable to a real measurement; every workflow must have explicit states, error handling, tests, and accessible controls. AI may explain and personalize practice, but must not invent measurements or present speculative anatomy as a diagnosis.

## Baseline audit (2026-10-29)

Repository: `diegotruant/Vivo-Voice` — default branch `main`. This plan is being developed on `codex/vivo-voice-production-readiness`; do not make risky changes directly on `main`.

### Confirmed from the current source

- Frontend: React 19, TypeScript, Vite 8, Tailwind 4; server: Express 4; AI SDK: `@google/genai`.
- Modules include pitch exercises, breathing, warm-ups, solfeggio, resonance/formant lab, vocal-range finder, progress, and a multitrack song studio.
- Pitch tracking is currently a custom autocorrelation implementation in `src/utils/audioEngine.ts`; microphone capture in several components uses `AnalyserNode`/requestAnimationFrame, while the song recorder uses deprecated `ScriptProcessorNode`.
- `src/App.tsx` seeds the progress dashboard with six fabricated sessions, uses a localStorage key, and exposes a simulated-session path. This is acceptable as a demo fixture only when explicitly labelled; it must not be confused with real learner history.
- `src/components/SongStudioDaw.tsx` exposes pitch-correction/mastering controls. The actual DSP must be verified independently of the UI labels before claiming that an AI model performs those transformations.
- `server.ts` has AI endpoints and catches failures with plausible-looking fallback coaching results. Fallbacks must be clearly marked and must never look like a successful measured diagnosis.
- `package.json` has build and TypeScript scripts but no automated test script or test framework visible in the manifest. There is no README in the root tree.
- The current UI and code use physiological language such as “diaphragmatic support”, “larynx position” and “formant” as explanations. Acoustic measurements alone cannot reliably infer these internal mechanics; coaching language must distinguish measured acoustic facts from pedagogical hypotheses.

### Immediate risks to validate

1. Reproducible install/build/typecheck, dependency lock consistency, and runtime startup.
2. Pitch estimator robustness: harmonic/octave errors, noise, room reverberation, vibrato, microphone gain, low/high registers, and mixed backing-track leakage.
3. Incorrect telemetry: the target pitch must come from the exercise/reference, not simply the nearest detected note; accuracy must exclude unvoiced/noisy frames and use confidence/voicing gates.
4. Audio lifecycle: permission denial, browser/device changes, tab backgrounding, context suspension, unmount cleanup, and avoiding microphone capture of speaker playback.
5. Audio processing claims versus implementation; safe clipping/headroom and offline render consistency.
6. Backend validation, rate limiting, timeouts, API-key handling, safe errors, and AI response schema validation.
7. Persistence and truthful progress: real sessions, empty states, export/delete controls, and migration/versioning.
8. Accessibility, mobile layouts, Italian localization, and clear microphone/privacy status.
9. Evidence-based learning: adapt difficulty, distribute practice, mix blocked and variable practice, reduce feedback gradually, and test retention/transfer rather than optimizing only instant scores.
10. Voice/recording privacy, retention, consent, and explicit disclosure whenever audio is sent to a third-party AI service.

## Product principles

- **Measurement before narrative:** show note, frequency, cents, confidence, voiced/unvoiced status, and capture quality; never fabricate precision.
- **No fake progress:** demo fixtures are opt-in and visibly labelled; production starts with a genuinely empty history.
- **Audio-first engineering:** use an AudioWorklet path for low-latency capture/processing where supported, with a tested fallback. Do not perform expensive analysis on every UI frame.
- **AI is an assistant, not an instrument:** deterministic DSP supplies measurements; the model receives validated summaries and returns schema-validated suggestions. Clearly label uncertainty and fallback responses.
- **Teacher-compatible:** practice goals, exercises and feedback should be understandable to a singing teacher and exportable for review.
- **Healthy voice use:** short, adjustable sessions; rest prompts; stop guidance for pain, persistent hoarseness, dizziness, or discomfort; no medical diagnosis claims.
- **Privacy by design:** local-first analysis when possible; explicit opt-in before uploading audio; minimal retention and a delete path.
- **Test every claim:** signal-processing unit tests, annotated audio evaluation, API contract tests, UI integration tests, and a manual browser/device matrix.

## Delivery phases and acceptance criteria

### Phase 0 — Stabilize the engineering baseline
- Add a useful README (setup, environment variables, run/build/test, architecture, known limitations).
- Verify clean install, lint/typecheck, production build, and start-up.
- Add automated CI and test scripts; keep secrets out of source and logs.
- Add error boundaries, consistent API errors, request validation, and health/readiness checks.
- Acceptance: clean checkout can be installed and built from documented instructions; CI fails on regressions.

### Phase 1 — Make audio measurements trustworthy
- Extract DSP into pure, testable modules with explicit sample-rate/window requirements.
- Add confidence/voicing estimation, DC removal, windowing, sensible filtering, and calibration/noise-floor handling.
- Compare the current detector against YIN/McLeod/PESTO/CREPE candidates using annotated singing datasets and synthetic test signals; choose by measured latency, accuracy and device cost rather than hype.
- Replace ScriptProcessorNode with AudioWorklet where appropriate; test fallback and mobile Safari/Chrome behavior.
- Build reference-aligned scoring, robust session summaries, and replayable per-frame timelines.
- Acceptance: published benchmark report with cents error, gross pitch error, octave-error rate, voiced/unvoiced precision, latency and tested devices.

### Phase 2 — Complete real learning workflows
- First-run setup and mic calibration; measured comfortable range (not automatic voice-type diagnosis).
- Exercises with target melody, pitch matching, scales/intervals, rhythm, breath pacing and ear training.
- Practice session lifecycle: prepare → calibrate → warm-up → exercise → review → save.
- Adaptive challenge and personalized plans based on repeated measurements; separate acquisition scores from retention probes.
- Real progress dashboard with trends, goals, session notes, CSV/JSON export and data deletion.
- Acceptance: every dashboard value is derived from real sessions and has a documented calculation.

### Phase 3 — Song practice and studio reliability
- Import legally obtained audio; align reference melody/lyrics and let users correct errors in auto-transcribed notes.
- Separate reference-vocal analysis from microphone input; recommend headphones and detect likely backing-track contamination.
- Phrase loop, speed control without pitch change where feasible, transposition, countdown, takes, aligned pitch trace, and export.
- Audit every DSP control against the actual signal chain. If a feature is only a prototype, label it honestly.
- Acceptance: repeatable import/record/playback/export on target browsers, no drift or clipped exports in test fixtures.

### Phase 4 — Pedagogically sound AI coach
- Use structured outputs with runtime schema validation, bounded input, timeouts, rate limits and cost observability.
- Prompt the coach to cite which measured evidence supports each suggestion and to distinguish observation from hypothesis.
- Build an exercise knowledge base reviewed by qualified vocal educators; no unsupported anatomical diagnosis.
- Reduce continuous feedback as skill improves; include delayed recall, variable practice and transfer tasks.
- Acceptance: golden test set for safe, useful, non-hallucinated advice; transparent fallback state; educators can review/edit exercise content.

### Phase 5 — Release quality
- Accessibility (keyboard, labels, contrast, reduced motion), responsive design, localization and onboarding.
- Privacy policy, retention controls, consent, third-party AI disclosures, security review, dependency/license review.
- Browser/device compatibility matrix, performance budgets, backups/monitoring, deployment and rollback instructions.
- User testing with beginner/intermediate/advanced singers and singing teachers.
- Acceptance: release checklist signed off; no critical bugs; all advertised features pass end-to-end tests.

## Research and reference projects

These are study references, not dependencies to copy blindly. Check each project's current license and model/data terms before adopting code or weights.

- OpenVox Studio: https://github.com/VadymYem/OpenVox — broad open-source browser studio, local-first audio workflow, AudioWorklet and WebAssembly-oriented architecture.
- VocalIQ: https://github.com/akhilvydyula/predict-voice-quality — real-time pitch feedback, on-device analysis and training history.
- Singing Trainer: https://github.com/dtomkatsu/singing-trainer — annotated take review, pitch/resonance/breathiness timelines, synthetic and real-dataset tests, and motor-learning practice design.
- Intonavio: https://github.com/pawelgawliczek/intonavio — song practice with reference melody, vocal separation and pitch scoring; useful architecture reference, not proof its external services are appropriate.
- MDN AudioWorklet: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- MDN getUserMedia: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- PESTO pitch estimation paper: https://arxiv.org/abs/2508.01488
- Principles of Motor Learning in Classical Singing Teaching: https://pubmed.ncbi.nlm.nih.gov/30712882/
- Motor learning and voice therapy review (2026): https://doi.org/10.1097/MOO.0000000000001126

## First implementation tasks

1. Make progress demo data explicitly opt-in and prevent simulated sessions from entering normal user history.
2. Add baseline test infrastructure and tests for frequency/MIDI conversion, note formatting, pitch detection on synthetic tones/noise/octave-rich signals, and audio export.
3. Correct scoring semantics: confidence-gated voiced frames, reference-target comparison, and no hard-coded default accuracy/vibrato values presented as measured results.
4. Make AI fallback/error status explicit; validate request and response payloads.
5. Add README and CI before broad refactors.
