// WAV helpers shared by the browser and the API route. Everything here deals
// with 16-bit little-endian mono PCM, which is what the client produces.

export const WAV_HEADER_BYTES = 44;

export function wavHeader(dataBytes: number, sampleRate: number): Uint8Array {
  const header = new Uint8Array(WAV_HEADER_BYTES);
  const view = new DataView(header.buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);
  return header;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const out = new Uint8Array(WAV_HEADER_BYTES + samples.length * 2);
  out.set(wavHeader(samples.length * 2, sampleRate), 0);
  const view = new DataView(out.buffer);
  for (let i = 0, offset = WAV_HEADER_BYTES; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

export interface ParsedWav {
  sampleRate: number;
  pcm: Uint8Array; // raw 16-bit mono samples
  durationSec: number;
}

/** Parses a WAV produced by encodeWav. Returns null for anything else. */
export function parseWav(bytes: Uint8Array): ParsedWav | null {
  if (bytes.length < WAV_HEADER_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const str = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (str(0) !== 'RIFF' || str(8) !== 'WAVE' || str(12) !== 'fmt ' || str(36) !== 'data') return null;
  if (view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint16(34, true) !== 16) return null;
  const sampleRate = view.getUint32(24, true);
  const dataBytes = Math.min(view.getUint32(40, true), bytes.length - WAV_HEADER_BYTES) & ~1;
  const pcm = bytes.subarray(WAV_HEADER_BYTES, WAV_HEADER_BYTES + dataBytes);
  return { sampleRate, pcm, durationSec: dataBytes / 2 / sampleRate };
}

/** Cuts [startSec, endSec) out of a parsed WAV and returns it as a new WAV file. */
export function sliceWav(wav: ParsedWav, startSec: number, endSec: number): Uint8Array {
  const start = Math.max(0, Math.floor(startSec * wav.sampleRate)) * 2;
  const end = Math.min(wav.pcm.length, Math.floor(endSec * wav.sampleRate) * 2);
  const data = wav.pcm.subarray(start, Math.max(start, end));
  const out = new Uint8Array(WAV_HEADER_BYTES + data.length);
  out.set(wavHeader(data.length, wav.sampleRate), 0);
  out.set(data, WAV_HEADER_BYTES);
  return out;
}
