// Browser-only: measures a voice memo. Claude can't hear audio, so these
// numbers are what it (and the clerk) get to be judgmental about.

import type { AudioFacts } from './judge';

export interface MeasuredAudio extends AudioFacts {
  peak: number;
}

const SR = 16000;
const WIN = 640; // 40 ms
const HOP = 320; // 20 ms

export async function measureAudio(blob: Blob): Promise<MeasuredAudio> {
  const Ctx: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let buf: AudioBuffer;
  try {
    buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    ctx.close();
  }
  const dur = Math.min(buf.duration, 60);
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(dur * SR)), SR);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start(0);
  const x = (await off.startRendering()).getChannelData(0);

  const rms: number[] = [];
  for (let i = 0; i + WIN <= x.length; i += HOP) {
    let s = 0;
    for (let j = i; j < i + WIN; j++) s += x[j] * x[j];
    rms.push(Math.sqrt(s / WIN));
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const q = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
  const thr = Math.max(q(0.1) * 3, q(0.95) * 0.12, 1e-4);
  const speech = rms.map((r) => r > thr);
  const speechSec = (speech.filter(Boolean).length * HOP) / SR;

  // Pitch: normalized autocorrelation on speech frames, 75–400 Hz.
  const f0: number[] = [];
  for (let k = 0; k < rms.length; k++) {
    if (!speech[k]) continue;
    const i = k * HOP;
    let e0 = 0;
    for (let j = 0; j < WIN; j++) e0 += x[i + j] * x[i + j];
    let best = 0;
    let lag = 0;
    for (let L = 40; L <= 213; L++) {
      let c = 0;
      let e1 = 0;
      for (let j = 0; j + L < WIN; j++) {
        c += x[i + j] * x[i + j + L];
        e1 += x[i + j + L] * x[i + j + L];
      }
      const n = c / Math.sqrt(e0 * e1 + 1e-12);
      if (n > best) {
        best = n;
        lag = L;
      }
    }
    if (best > 0.55 && lag) f0.push(SR / lag);
  }
  let rangeSt = 0;
  let medianHz = 0;
  if (f0.length > 8) {
    const s = [...f0].sort((a, b) => a - b);
    medianHz = s[Math.floor(s.length / 2)];
    rangeSt = 12 * Math.log2(s[Math.floor(s.length * 0.9)] / s[Math.floor(s.length * 0.1)]);
  }

  // Syllable-ish rate: peaks in smoothed energy at least 100 ms apart.
  const sm = rms.map((_, i) => (rms[Math.max(0, i - 1)] + rms[i] + rms[Math.min(rms.length - 1, i + 1)]) / 3);
  let peaks = 0;
  let last = -10;
  for (let i = 1; i < sm.length - 1; i++) {
    if (speech[i] && sm[i] > sm[i - 1] && sm[i] >= sm[i + 1] && i - last >= 5) {
      peaks++;
      last = i;
    }
  }
  return {
    durationSec: +dur.toFixed(1),
    speechSec: +speechSec.toFixed(1),
    pauseRatio: dur ? +(1 - speechSec / dur).toFixed(2) : 0,
    pitchRangeSemitones: +rangeSt.toFixed(1),
    medianPitchHz: Math.round(medianHz),
    syllablesPerSec: speechSec > 0.5 ? +(peaks / speechSec).toFixed(1) : 0,
    peak: q(1),
  };
}
