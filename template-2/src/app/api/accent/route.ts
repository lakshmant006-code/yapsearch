import { NextResponse } from 'next/server';
import type { AccentAnalysis, AccentRequest } from '@/lib/accent/types';

// Text-only models can't hear an accent, so this route sends the raw audio to an
// audio-input model. Override the model with OPENAI_AUDIO_MODEL if needed
// (e.g. "gpt-4o-audio-preview").
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_AUDIO_MODEL || 'gpt-audio';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// ~90 s of 16 kHz mono 16-bit WAV is ~2.9 MB raw / ~3.9 MB base64.
const MAX_BASE64_LENGTH = 5_000_000;

const SYSTEM_PROMPT = `You are a forensic phonetician and dialect coach. You listen to a recording of someone speaking English and decide whether the accent they are using is their native accent or one they are putting on (imitating, exaggerating, or performing).

Things that tend to give away a fake accent:
- Inconsistency: a feature (e.g. non-rhotic "car", the TRAP-BATH split, T-glottaling, monophthongal vowels) appears on some words but not on others of the same type.
- Drift: the accent is strong at the start and fades, or comes and goes, especially on unscripted or fast speech.
- Over-application / hypercorrection: applying a feature where natives would not (e.g. dropping /r/ in a linking context, using "ah" in words that do not have the BATH vowel in that accent).
- Stereotype-only features: loud, cliched markers (catchphrase vowels, exaggerated intonation) with the subtler features (vowel quality, connected-speech processes, rhythm, prosody) left in the speaker's own accent.
- Prosody mismatch: segmental features of one accent sitting on the intonation and rhythm of another.
- Effortful delivery: unnatural slowing or emphasis on accent-marked words.

Signs of an authentic accent: consistent, systematic features including unstressed and function words, natural connected speech, prosody that matches the segments, and no leaks of a different system.

Be honest about uncertainty. Short clips, poor audio, or a speaker with a genuinely mixed background should lower your confidence. Real people's accents legitimately vary (code-switching, mixed upbringing, long residence abroad) - do not call those fake unless the evidence is specific. Base every claim on things you actually heard and quote the words where possible.

Respond with ONLY a JSON object, no markdown fences, matching exactly this TypeScript type:
{
  "verdict": "authentic" | "likely_fake" | "uncertain",
  "authenticityScore": number,        // 0 = obviously put on, 100 = clearly native
  "confidence": "low" | "medium" | "high",
  "perceivedAccent": string,          // the accent being produced, as specific as you can
  "likelyNativeAccent": string | null,// if put on, the accent that leaks through; null if authentic or unknown
  "consistencyScore": number,         // 0-100, how steady the accent is across the clip
  "summary": string,                  // 2-3 sentences
  "evidence": [{ "feature": string, "observation": string, "pointsTo": "authentic" | "fake" | "neutral" }], // 3-7 items
  "slips": string[],                  // specific words/moments where a different accent leaked; empty if none
  "coachingTips": string[],           // 2-4 concrete tips to make this accent more convincing
  "transcript": string                // what was said
}`;

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not set in environment variables' },
      { status: 500 },
    );
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
    return NextResponse.json({ error: 'Audio is too long (max ~90 seconds)' }, { status: 413 });
  }

  const claim = typeof claimedAccent === 'string' ? claimedAccent.trim().slice(0, 100) : '';
  const userText = claim
    ? `The speaker claims (or is attempting) this accent: "${claim}". Judge whether it is their genuine native accent or a put-on one.`
    : 'Identify the accent and judge whether it is the speaker\'s genuine native accent or a put-on one.';

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        modalities: ['text'],
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              { type: 'input_audio', input_audio: { data: audioBase64, format: 'wav' } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('OpenAI audio error:', response.status, err);
      return NextResponse.json(
        { error: err?.error?.message || `Model request failed (${response.status})` },
        { status: 502 },
      );
    }

    const data = await response.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    const analysis = parseAnalysis(content);
    if (!analysis) {
      console.error('Unparseable model output:', content);
      return NextResponse.json({ error: 'The model returned an unreadable analysis. Try again.' }, { status: 502 });
    }
    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Accent analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze audio' },
      { status: 500 },
    );
  }
}

function parseAnalysis(text: string): AccentAnalysis | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }

  const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
  const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;

  return {
    verdict: oneOf(raw.verdict, ['authentic', 'likely_fake', 'uncertain'] as const, 'uncertain'),
    authenticityScore: clamp(raw.authenticityScore),
    confidence: oneOf(raw.confidence, ['low', 'medium', 'high'] as const, 'low'),
    perceivedAccent: str(raw.perceivedAccent, 'Unknown'),
    likelyNativeAccent: typeof raw.likelyNativeAccent === 'string' ? raw.likelyNativeAccent : null,
    consistencyScore: clamp(raw.consistencyScore),
    summary: str(raw.summary),
    evidence: Array.isArray(raw.evidence)
      ? raw.evidence
          .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
          .map((e) => ({
            feature: str(e.feature),
            observation: str(e.observation),
            pointsTo: oneOf(e.pointsTo, ['authentic', 'fake', 'neutral'] as const, 'neutral'),
          }))
      : [],
    slips: strArr(raw.slips),
    coachingTips: strArr(raw.coachingTips),
    transcript: str(raw.transcript),
  };
}
