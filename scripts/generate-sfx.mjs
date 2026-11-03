// Generates the app's sound effects with ElevenLabs and saves them to
// public/sfx/<name>.mp3. The app falls back to synthesized sounds for any
// file that's missing.
//
//   ELEVENLABS_API_KEY=... node scripts/generate-sfx.mjs [name ...]
import { writeFile, mkdir } from 'node:fs/promises';

const SFX = {
  pop: 'Soft bubbly cartoon pop, short crisp UI click',
  listen: 'Cartoon curious ear perk, quick rising spring boing, playful and short',
  ok: 'Smug cartoon success chime, bright sparkly ding with a cheeky upward slide whistle, short',
  stamp: 'Heavy rubber stamp slamming onto a wooden desk, loud deep thud, close-mic',
  fake: 'Cartoon fail sting, sarcastic descending wah-wah-wah-waaah muted trombone, comedic',
  spit: 'Cartoon llama spitting, wet comedic pfft raspberry, close-mic',
};

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('Set ELEVENLABS_API_KEY first.');
  process.exit(1);
}
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SFX);
await mkdir(new URL('../public/sfx/', import.meta.url), { recursive: true });

for (const name of names) {
  if (!SFX[name]) {
    console.error(`Unknown sound "${name}". Options: ${Object.keys(SFX).join(', ')}`);
    continue;
  }
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: SFX[name], prompt_influence: 0.5 }),
  });
  if (!res.ok) {
    console.error(`${name}: ElevenLabs returned ${res.status} ${await res.text()}`);
    continue;
  }
  const file = new URL(`../public/sfx/${name}.mp3`, import.meta.url);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  console.log(`${name}: saved public/sfx/${name}.mp3`);
}
