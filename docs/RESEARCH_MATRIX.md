# Vivo-Voice — Research and capability matrix

Reviewed on 2026-10-29. These projects and papers are reference material for architecture and evaluation; they are not automatically approved dependencies. Before adopting code, model weights, datasets, or services, review the current license, privacy terms, attribution obligations, and device/runtime costs.

| Reference | Capability to study | Application to Vivo-Voice | Decision / guardrail |
| --- | --- | --- | --- |
| [OpenVox Studio](https://github.com/VadymYem/OpenVox) | Local-first browser studio, AudioWorklet/WASM audio path, structured practice, offline projects, accessibility and mobile handling | Compare its audio lifecycle, module boundaries, persistence and mobile UX with our current components | Reuse architectural ideas; do not copy code until license and attribution are reviewed |
| [Singing Trainer](https://github.com/dtomkatsu/singing-trainer) | Frame-by-frame take review, acoustic metric timelines, pitch-detector tests, real annotated singing evaluation, practice schedules | Build a reproducible DSP benchmark and review timeline; use retention probes and gradually reduce feedback | Prioritize test methods and measurement semantics over visual similarity |
| [VocalIQ](https://github.com/akhilvydyula/predict-voice-quality) | On-device pitch analysis, score breakdowns, session history, progressive training tools | Benchmark onboarding, session summaries, privacy-first defaults and practice history | Avoid opaque composite scores; every score must have a documented formula |
| [Intonavio](https://github.com/pawelgawliczek/intonavio) | Song-based pitch practice, editable reference melody, stem separation, phrase-level feedback | Use as a product workflow reference for imported songs and reference-pitch correction | Do not depend on YouTube scraping or external separation APIs without checking rights, terms, costs and failure modes |
| [PESTO paper](https://arxiv.org/abs/2508.01488) | Lightweight self-supervised pitch estimation designed for low latency | Evaluate as a candidate detector against the custom autocorrelation implementation | Adopt only if benchmark results improve pitch accuracy and latency on target devices |
| [MDN AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet) | Low-latency audio processing off the main UI thread | Replace ScriptProcessorNode for real-time recording/analysis where appropriate; add a tested fallback | AudioWorklet requires a secure context and browser compatibility testing |
| [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) | Permission lifecycle and microphone capture | Standardize permission states, device errors, track cleanup, background/resume handling | Never start capture unexpectedly; make active microphone state visible |
| [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) | Schema-constrained model output | Validate AI coach responses with a runtime schema (e.g. Zod), reject malformed or out-of-range fields, and keep a clear fallback state | Schema-valid JSON can still be pedagogically wrong; validate semantics and review generated advice |
| [Principles of Motor Learning in Classical Singing Teaching](https://pubmed.ncbi.nlm.nih.gov/30712882/) | Acquisition, feedback, modeling and self-monitoring in singing lessons | Design exercise progression around clear goals, useful demonstrations and measurable attempts | Evidence base is limited; use as an instructional framework, not a claim that a specific algorithm improves singing |
| [Motor-learning review in voice therapy (2026)](https://doi.org/10.1097/MOO.0000000000001126) | Distributed practice, variable practice, fading feedback, retention and transfer | Separate immediate performance from learning; add delayed recall and unpracticed transfer checks | Avoid maximizing immediate score at the expense of independent skill retention |

## Required evaluation before selecting a pitch engine

Run all candidate detectors against the same frozen corpus and record:

- median and 95th-percentile absolute cents error on voiced frames;
- gross pitch error and octave-error rate;
- voiced/unvoiced precision and recall;
- behavior under vibrato, breathiness, noise, reverberation and backing-track leakage;
- latency, CPU/battery use, memory and performance on mobile Safari and Chrome;
- performance across low, middle and high singing registers and a range of voice types.

Use synthetic signals for controlled regression tests and annotated real singing for external validity. Do not treat synthetic-only tests as proof of singing accuracy.

## Pedagogy and metric integrity

- Keep measured acoustic observations (pitch, loudness, timing, spectral estimates) separate from inferred technique (breath management, laryngeal behavior, resonance sensations).
- Phrase internal-physiology explanations as hypotheses unless the system has direct evidence for them.
- Prefer actionable, specific feedback over a single global score.
- Start with frequent simple feedback for acquisition, then reduce feedback and vary exercises to promote self-monitoring, retention and transfer.
- Add short-session guidance and stop prompts for pain, dizziness, or persistent vocal discomfort.
- Make audio processing and third-party AI uploads explicit; local-first should be the default whenever it meets quality requirements.
