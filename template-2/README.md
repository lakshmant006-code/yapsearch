# F.A.K.E.

A satirical accent investigation, built with Next.js and Claude.

## How it works

1. **Evidence intake.** Upload a voice memo, type what you said, or both, and optionally say which accent you're "going for".
2. **Measurements in the browser** (`src/lib/fake/audio.ts`). The voice memo is decoded locally and measured: seconds of speech, pitch range, speaking pace and pauses. The audio never leaves the browser.
3. **The (fictional) score** (`src/lib/fake/judge.ts`). Words like “cheers” and “mate”, dropped T's (“wa’er”), pitch range, pace and whether you admitted to attempting an accent add up to a suspicion level and pick one of eight result types.
4. **Claude writes the allegations** (`src/app/api/allegations/route.ts`). The server recomputes the score, sends the facts to Claude, and gets structured JSON back: the observation, suspected influence, vowel drama, evidence quality, charge and sentence. If Claude is switched off, unavailable or declines, a template "clerk" writes them instead, and the report says so.

Claude never hears the audio. It only gets the numbers and the words.

## Setup

```
cp .env.example .env.local   # then fill in ANTHROPIC_API_KEY
npm install
npm run dev
```

Environment variables:

- `ANTHROPIC_API_KEY`: required for Claude-written allegations. Without it the app still works, using the template clerk.
- `FAKE_CLAUDE_MODEL`: optional, defaults to `claude-opus-5-5`.

Requests use low effort and server-side refusal fallbacks (`fallbacks: "default"`).

The illustration on the welcome and review screens is `public/fake-hero.webp`.
