import { NextResponse } from 'next/server';
import { aggregate } from '@/lib/accent/aggregate';
import { parseWav, sliceWav } from '@/lib/audio/pcm';
import type { AccentEvidence, AccentRequest, RunAnalysis, SegmentProbe, Verdict } from '@/lib/accent/types';

// Text-only models can't hear an accent, so the raw audio goes to an
// audio-input model. Override with OPENAI_AUDIO_MODEL (e.g. "gpt-4o-audio-preview").
const OPENAI_API_URL = `${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`;
const MODEL = process.env.OPENAI_AUDIO_MODEL || 'gpt-audio';

// Precision comes from repetition: several independent listens of the whole
// clip, plus a separate accent-strength check on each segment.
const FULL_RUNS = 3;
const MAX_SEGMENTS = 6;

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// ~60 s of 16 kHz mono 16-bit WAV is ~1.9 MB raw / ~2.6 MB base64.
const MAX_BASE64_LENGTH = 3_200_000;

const FULL_PROMPT = `You are a forensic phonetician and dialect coach. You listen to a recording of someone speaking English and decide whether the accent they are using is their native accent or one they are putting on (imitating, exaggerating, or performing).

Things that give away a fake accent:
- Inconsistency: a feature (e.g. non-rhotic "car", the TRAP-BATH split, T-glottaling, monophthongal vowels) appears on some words but not on others of the same lexical set.
- Drift: the accent is strong at the start and fades, or comes and goes, especially on fast or unscripted speech.
- Over-application / hypercorrection: applying a feature where natives would not.
- Stereotype-only features: loud cliched markers, with the subtler features (unstressed vowels, function words, connected-speech processes, rhythm) left in the speaker's own accent.
- Prosody mismatch: segmental features of one accent on the intonation and rhythm of another.
- Effortful delivery: unnatural slowing or emphasis on accent-marked words.

Signs of an authentic accent: consistent, systematic features including unstressed syllables and function words, natural connected speech, prosody that matches the segments, and no leaks of a different system.

Rules for precision:
- Only report things you actually heard. Every evidence item must quote at least one specific word from the recording.
- Compare the same lexical set across several words before calling something inconsistent.
- Real accents legitimately vary (mixed upbringing, long residence abroad, code-switching). Do not call those fake without specific leaks.
- If the audio does not give clear evidence either way, use verdict "uncertain" and a score between 40 and 60. Do not guess.
- Score calibration: 0-20 obvious caricature; 21-40 clearly put on but sustained; 41-59 unclear; 60-79 probably native with minor oddities; 80-100 unmistakably native.

Respond with ONLY a JSON object, no markdown fences:
{
  "verdict": "authentic" | "likely_fake" | "uncertain",
  "authenticityScore": number,
  "perceivedAccent": string,           // as specific as you can (region/city if clear)
  "likelyNativeAccent": string | null, // if put on: the accent that leaks through; else null
  "consistencyScore": number,          // 0-100, how steady the accent is across the clip
  "summary": string,                   // 2-3 sentences
  "evidence": [{ "feature": string, "observation": string, "pointsTo": "authentic" | "fake" | "neutral" }], // 3-7 items, each quoting words
  "slips": string[],                   // specific words where a different accent leaked; [] if none
  "coachingTips": string[],            // 2-4 concrete tips to make this accent more convincing
  "transcript": string
}`;

const SEGMENT_PROMPT = (target: string) => `You are a phonetician. You will hear a short excerpt of English speech.
Rate how strongly and consistently THIS excerpt exhibits the features of this accent: "${target}".
Judge every word, including unstressed syllables and function words, not just the most noticeable ones.

Respond with ONLY JSON, no markdown:
{
  "targetStrength": number,   // 0 = none of the target accent's features, 100 = fully and consistently that accent
  "leaks": string[]           // words where a DIFFERENT accent surfaced, each as: "\\"word\\" - what you heard"; [] if none
}`;

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not set in environment variables' }, { status: 500 });
  }

  let body: AccentRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { audioBase64, claimedAccent } = body;
  if (!audioBase64 || typeof audioBase64 !== 'string') {
    return NextResponse.json({ error: 'audioBase64 is required' }, { status: 400 });
  }
  if (audioBase64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json({ error: 'Audio is too long (max 60 seconds)' }, { status: 413 });
  }
  const wav = parseWav(new Uint8Array(Buffer.from(audioBase64, 'base64')));
  if (!wav) return NextResponse.json({ error: 'Audio must be 16-bit mono PCM WAV' }, { status: 400 });

  const segments = (Array.isArray(body.segments) ? body.segments : [])
    .filter((s) => Number.isFinite(s?.start) && Number.isFinite(s?.end) && s.end - s.start >= 3 && s.start >= 0 && s.end <= wav.durationSec + 0.5)
    .slice(0, MAX_SEGMENTS);
  const speechSec = Number.isFinite(body.speechSec) ? Number(body.speechSec) : wav.durationSec;
  const claim = typeof claimedAccent === 'string' ? claimedAccent.trim().slice(0, 100) : '';

  const userText = claim
    ? `The speaker claims (or is attempting) this accent: "${claim}". Judge whether it is their genuine native accent or a put-on one.`
    : "Identify the accent and judge whether it is the speaker's genuine native accent or a put-on one.";

  try {
    // Stage 1: independent full-clip listens, in parallel.
    const settled = await Promise.allSettled(
      Array.from({ length: FULL_RUNS }, () =>
        callModel(apiKey, FULL_PROMPT, userText, audioBase64, 0.5).then((text) => {
          const run = parseRun(text);
          if (!run) throw new Error('Unreadable analysis');
          return run;
        }),
      ),
    );
    const runs = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
    if (runs.length < 2) {
      const firstErr = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
      throw firstErr?.reason ?? new Error('Analysis failed');
    }

    // Stage 2: segment strength probes against the claimed accent, or the
    // accent most runs heard if nothing was claimed.
    const target = claim || mostCommon(runs.map((r) => r.perceivedAccent));
    const probes = (
      await Promise.allSettled(
        segments.map(async (seg): Promise<SegmentProbe> => {
          const clip = Buffer.from(sliceWav(wav, seg.start, seg.end)).toString('base64');
          const parsed = parseJson(await callModel(apiKey, SEGMENT_PROMPT(target), 'Rate this excerpt.', clip, 0.2));
          if (!parsed || !Number.isFinite(Number(parsed.targetStrength))) throw new Error('Unreadable probe');
          return {
            start: seg.start,
            end: seg.end,
            targetStrength: clamp(parsed.targetStrength),
            leaks: strArr(parsed.leaks).slice(0, 4),
          };
        }),
      )
    ).flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));

    return NextResponse.json(aggregate(runs, probes, { targetAccent: target, speechSec }));
  } catch (error) {
    console.error('Accent analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze audio' },
      { status: 502 },
    );
  }
}

async function callModel(apiKey: string, system: string, text: string, wavBase64: string, temperature: number): Promise<string> {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      modalities: ['text'],
      temperature,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text },
            { type: 'input_audio', input_audio: { data: wavBase64, format: 'wav' } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error('OpenAI audio error:', response.status, err);
    throw new Error(err?.error?.message || `Model request failed (${response.status})`);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

function parseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

function parseRun(text: string): RunAnalysis | null {
  const raw = parseJson(text);
  if (!raw || !Number.isFinite(Number(raw.authenticityScore))) return null;
  const evidence: AccentEvidence[] = Array.isArray(raw.evidence)
    ? raw.evidence
        .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
        .map((e) => ({
          feature: str(e.feature),
          observation: str(e.observation),
          pointsTo: oneOf(e.pointsTo, ['authentic', 'fake', 'neutral'] as const, 'neutral'),
        }))
        .filter((e) => e.feature && e.observation)
    : [];
  return {
    verdict: oneOf<Verdict>(raw.verdict, ['authentic', 'likely_fake', 'uncertain'] as const, 'uncertain'),
    authenticityScore: clamp(raw.authenticityScore),
    perceivedAccent: str(raw.perceivedAccent, 'Unknown'),
    likelyNativeAccent: typeof raw.likelyNativeAccent === 'string' && raw.likelyNativeAccent.trim() ? raw.likelyNativeAccent : null,
    consistencyScore: clamp(raw.consistencyScore),
    summary: str(raw.summary),
    evidence,
    slips: strArr(raw.slips),
    coachingTips: strArr(raw.coachingTips),
    transcript: str(raw.transcript),
  };
}

function mostCommon(xs: string[]): string {
  const counts = new Map<string, number>();
  xs.forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown';
}
