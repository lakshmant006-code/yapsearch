# F.A.K.E.

A sarcastic cartoon llama listens to you and says whether your accent is real: a flat yes or no. Just for fun.

## How it works

1. A "just for fun" notice opens every time.
2. Pick **English**, **French** or **Italian** at the top. Suggested phrases sit at the bottom, but you can say anything.
3. Tap the mic. The llama turns an ear toward you while it listens (up to 8 seconds, or tap again to stop).
4. The browser does the listening (`src/app/page.tsx`, `src/lib/fake/audio.ts`):
   - its speech recognition, set to the chosen language, returns what it heard and how sure it was;
   - the recording is measured locally for speech time, pitch range, pace and pauses. The audio itself is never uploaded.
5. **Claude judges** (`src/app/api/verdict/route.ts`): `claude-opus-5-5` gets those words and numbers and returns structured JSON, `{ ok, line }`. If Claude is unavailable, a house rule in `src/lib/fake/accents.ts` decides instead.
6. **Accent OK**: the llama puts on sunglasses. **Accent Not OK**: a FAKE! stamp slams down, followed by NOPE, BUSTED, SUS and DENIED, with a screen shake.

The llama is a single SVG with four poses (`src/lib/fake/llama.ts`); its styles and animations are in `src/app/globals.css`.

Speech recognition works best in Chrome, Edge and Safari. Without it, the verdict leans on the voice measurements only.

## Sound effects

Sounds come from ElevenLabs: `pop`, `listen`, `ok`, `stamp`, `fake`, `spit` in `public/sfx/*.mp3`. Generate them with:

```
ELEVENLABS_API_KEY=... node scripts/generate-sfx.mjs
```

Any missing file falls back to a small synthesized sound, so the app works without them.

## Setup

```
cp .env.example .env.local   # then fill in ANTHROPIC_API_KEY
npm install
npm run dev
```

- `ANTHROPIC_API_KEY`: lets Claude judge. Without it, the house rule decides.
- `FAKE_CLAUDE_MODEL`: optional, defaults to `claude-opus-5-5`.
