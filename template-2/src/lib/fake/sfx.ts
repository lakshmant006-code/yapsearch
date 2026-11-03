// Sound effects. Plays the ElevenLabs file in /public/sfx/<name>.mp3 when it
// exists (see scripts/generate-sfx.mjs), otherwise a small synthesized stand-in.

export type SfxName = 'pop' | 'listen' | 'ok' | 'stamp' | 'fake' | 'spit';

let ctx: AudioContext | null = null;
const ac = () =>
  (ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());

function tone(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, c.currentTime + t0);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, c.currentTime + t0 + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + t0);
  o.stop(c.currentTime + t0 + dur + 0.05);
}

function noise(t0: number, dur: number, vol: number, freq: number) {
  const c = ac();
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const s = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  s.buffer = buf;
  f.type = 'lowpass';
  f.frequency.value = freq;
  g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination);
  s.start(c.currentTime + t0);
}

const SYNTH: Record<SfxName, () => void> = {
  pop: () => tone('sine', 520, 880, 0, 0.09, 0.25),
  listen: () => {
    tone('triangle', 300, 760, 0, 0.18, 0.22);
    tone('sine', 900, 1300, 0.16, 0.08, 0.12);
  },
  ok: () => {
    tone('triangle', 660, 0, 0, 0.12, 0.25);
    tone('triangle', 990, 0, 0.11, 0.22, 0.25);
    tone('sine', 1980, 2600, 0.3, 0.1, 0.08);
    tone('sine', 2400, 3100, 0.4, 0.1, 0.06);
  },
  stamp: () => {
    noise(0, 0.22, 0.9, 900);
    tone('sine', 120, 45, 0, 0.25, 0.7);
  },
  fake: () => [392, 370, 349, 294].forEach((f, i) => tone('sawtooth', f, i === 3 ? 240 : 0, i * 0.22, i === 3 ? 0.55 : 0.2, 0.09)),
  spit: () => noise(0, 0.3, 0.35, 3200),
};

// Remember which ElevenLabs files are missing so we only try once.
const missing = new Set<SfxName>();

export function playSfx(name: SfxName) {
  if (missing.has(name)) return SYNTH[name]();
  const audio = new Audio(`/sfx/${name}.mp3`);
  audio.volume = 0.9;
  audio.play().catch(() => {
    missing.add(name);
    try {
      SYNTH[name]();
    } catch {}
  });
}
