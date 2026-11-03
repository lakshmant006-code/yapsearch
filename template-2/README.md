# Accent Detector

Record someone speaking (or upload a clip) and find out whether their accent is real or put on.

## How it gets a precise answer

1. **Quality gate (in the browser).** The clip is resampled to 16 kHz mono and checked for amount of speech, signal-to-noise ratio and clipping. Clips with under 10 s of speech or heavy noise are rejected instead of guessed at.
2. **Three independent listens.** The whole clip is sent to an audio-input model three times. Each listen returns a verdict, a 0–100 authenticity score, and evidence that quotes specific words.
3. **Per-segment drift check.** The clip is cut into ~10 s chunks at natural pauses. Each chunk is rated separately for how strongly it shows the target accent, so drift and fading are measured numerically instead of being left to the model's impression.
4. **Conservative verdict rules** (`src/lib/accent/aggregate.ts`). "Probably put on" needs most listens to agree and a final score ≤ 40. "Sounds authentic" needs agreement, a score ≥ 60 and no significant drift. Anything else is reported as "Hard to tell". Strong drift lowers the score.

The results page shows each listen's score, the segment-by-segment strengths, and which rules produced the verdict.

## Setup

```
cp .env.example .env.local   # then fill in OPENAI_API_KEY
npm install
npm run dev
```

Environment variables:

- `OPENAI_API_KEY`: required.
- `OPENAI_AUDIO_MODEL`: optional, defaults to `gpt-audio`. Any chat-completions model that accepts `input_audio` works.
- `OPENAI_BASE_URL`: optional, defaults to `https://api.openai.com/v1`.

Each analysis makes 3 full-clip calls plus up to 6 short segment calls.
