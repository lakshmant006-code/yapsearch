// Client-side audio preparation: decode whatever the browser can play
// (webm/opus from the mic, mp3/m4a/wav uploads), resample to 16 kHz mono,
// measure recording quality, and pick segment boundaries at natural pauses so
// the server can check whether the accent holds steady across the clip.

import { encodeWav } from './pcm';

export const TARGET_SAMPLE_RATE = 16000;
export const MAX_SECONDS = 60;
export const MIN_SPEECH_SECONDS = 10; // below this we refuse to judge
export const GOOD_SPEECH_SECONDS = 20; // below this confidence is capped

const FRAME_SEC = 0.02;
const SEGMENT_TARGET_SEC = 10;
const SEGMENT_MIN_SEC = 6;
const SEGMENT_MAX_SEC = 14;
const MAX_SEGMENTS = 6;

export interface AudioQuality {
  durationSec: number;
  speechSec: number;
  snrDb: number;
  clippedPct: number;
  issues: string[];
  blocking: boolean; // too poor to give a trustworthy answer
}

export interface Segment {
  start: number;
  end: number;
}

export interface PreparedAudio {
  base64: string;
  quality: AudioQuality;
  segments: Segment[];
  truncated: boolean;
}

export async function prepareAudio(blob: Blob): Promise<PreparedAudio> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    ctx.close();
  }

  const truncated = decoded.duration > MAX_SECONDS;
  const length = Math.ceil(Math.min(decoded.duration, MAX_SECONDS) * TARGET_SAMPLE_RATE);

  // Resample + downmix to mono.
  const offline = new OfflineAudioContext(1, length, TARGET_SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  const raw = rendered.getChannelData(0);

  const frames = frameRms(raw, TARGET_SAMPLE_RATE);
  const quality = measureQuality(raw, frames);
  const segments = quality.blocking ? [] : findSegments(frames, quality);
  const samples = normalize(raw);

  return { base64: bytesToBase64(encodeWav(samples, TARGET_SAMPLE_RATE)), quality, segments, truncated };
}

function frameRms(samples: Float32Array, sampleRate: number): Float32Array {
  const size = Math.round(FRAME_SEC * sampleRate);
  const n = Math.floor(samples.length / size);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let sum = 0;
    for (let i = f * size; i < (f + 1) * size; i++) sum += samples[i] * samples[i];
    out[f] = Math.sqrt(sum / size);
  }
  return out;
}

function percentile(values: Float32Array, p: number): number {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

// Energy-based voice activity: a frame is speech if it is well above the noise floor.
function speechThreshold(frames: Float32Array): number {
  const noise = percentile(frames, 0.1);
  const loud = percentile(frames, 0.95);
  return Math.max(noise * 3, loud * 0.1, 1e-4);
}

function measureQuality(samples: Float32Array, frames: Float32Array): AudioQuality {
  const durationSec = samples.length / TARGET_SAMPLE_RATE;
  const threshold = speechThreshold(frames);
  let speechFrames = 0;
  for (let i = 0; i < frames.length; i++) if (frames[i] > threshold) speechFrames++;
  const speechSec = speechFrames * FRAME_SEC;

  const noise = Math.max(percentile(frames, 0.1), 1e-5);
  const speechLevel = percentile(frames, 0.9);
  const snrDb = 20 * Math.log10(speechLevel / noise);

  let clipped = 0;
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) >= 0.99) clipped++;
  const clippedPct = (clipped / Math.max(1, samples.length)) * 100;

  const issues: string[] = [];
  let blocking = false;
  if (speechLevel < 0.003) {
    issues.push('The recording is almost silent. Check the microphone.');
    blocking = true;
  } else if (speechSec < MIN_SPEECH_SECONDS) {
    issues.push(`Only ~${speechSec.toFixed(0)}s of speech detected. At least ${MIN_SPEECH_SECONDS}s is needed for a reliable judgement.`);
    blocking = true;
  } else if (speechSec < GOOD_SPEECH_SECONDS) {
    issues.push(`~${speechSec.toFixed(0)}s of speech. ${GOOD_SPEECH_SECONDS}s+ gives a more precise result.`);
  }
  if (snrDb < 8) {
    issues.push('Very noisy recording. Background noise hides the details that matter.');
    blocking = true;
  } else if (snrDb < 15) {
    issues.push('Some background noise. A quieter room will improve precision.');
  }
  if (clippedPct > 1) issues.push('The audio is distorting (too loud). Move back from the mic.');

  return { durationSec, speechSec, snrDb, clippedPct, issues, blocking };
}

// Split into ~10s chunks, cutting at the quietest frame in each window so no
// word is cut in half. Chunks with too little speech are dropped.
function findSegments(frames: Float32Array, quality: AudioQuality): Segment[] {
  if (quality.speechSec < SEGMENT_MIN_SEC * 2) return [];
  const threshold = speechThreshold(frames);
  const total = frames.length;
  const toFrames = (s: number) => Math.round(s / FRAME_SEC);
  const segments: Segment[] = [];
  let start = 0;

  while (start < total) {
    let end: number;
    if (total - start <= toFrames(SEGMENT_MAX_SEC)) {
      end = total;
    } else {
      const lo = start + toFrames(SEGMENT_MIN_SEC);
      const hi = Math.min(total - toFrames(SEGMENT_MIN_SEC / 2), start + toFrames(SEGMENT_MAX_SEC));
      end = start + toFrames(SEGMENT_TARGET_SEC);
      let best = Infinity;
      for (let f = lo; f < hi; f++) {
        // Prefer quiet frames, lightly biased toward the target length.
        const score = frames[f] + Math.abs(f - (start + toFrames(SEGMENT_TARGET_SEC))) * 1e-6;
        if (score < best) {
          best = score;
          end = f;
        }
      }
      // Don't leave a tail too short to judge; fold it into this segment.
      if (total - end < toFrames(SEGMENT_MIN_SEC)) end = total;
    }
    let speech = 0;
    for (let f = start; f < end; f++) if (frames[f] > threshold) speech++;
    if (speech * FRAME_SEC >= 3) segments.push({ start: start * FRAME_SEC, end: end * FRAME_SEC });
    start = end;
  }

  if (segments.length <= MAX_SEGMENTS) return segments;
  // Too many: keep evenly spaced ones, always including the first and last.
  const picked: Segment[] = [];
  for (let i = 0; i < MAX_SEGMENTS; i++) {
    picked.push(segments[Math.round((i * (segments.length - 1)) / (MAX_SEGMENTS - 1))]);
  }
  return picked;
}

// Peak-normalize quiet recordings so the model gets a usable level.
function normalize(samples: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak === 0 || peak > 0.5) return samples;
  const gain = 0.9 / peak;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}
