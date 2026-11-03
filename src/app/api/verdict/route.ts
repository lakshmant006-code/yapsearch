import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LANGS } from '@/lib/fake/accents';

// Claude is the judge. It never hears audio: it gets what the browser's speech
// recognition heard (in the target language), how confident that was, and a
// few measurements of the voice. It answers yes or no, plus one sarcastic line.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = process.env.FAKE_CLAUDE_MODEL || 'claude-opus-5-5';

const VerdictSchema = z.object({
  ok: z.boolean().describe('true if the accent passes, false if it is fake'),
  line: z.string().describe('One short sarcastic line from the llama, max 14 words'),
});

const RequestSchema = z.object({
  lang: z.enum(['en', 'fr', 'it']),
  transcript: z.string().max(600),
  confidence: z.number().min(0).max(1).nullable(),
  phrase: z.string().max(200).nullable(),
  speechSec: z.number().min(0).max(120),
  pitchRangeSemitones: z.number().min(0).max(60),
  syllablesPerSec: z.number().min(0).max(20),
  pauseRatio: z.number().min(0).max(1),
});

const SYSTEM = `You are the judge in F.A.K.E., a silly app where a sarcastic cartoon llama decides whether someone is faking an accent. It is satire, for fun.

How to decide (yes or no, never in between):
- The strongest signal is the speech recognizer: it was set to the target language. Low confidence (under about 0.6), or an empty or garbled transcript despite real speech, means the accent didn't land: fake.
- A transcript that matches the suggested phrase or reads as fluent target-language speech with good confidence is a pass.
- Theatrical delivery also counts as fake: a pitch range over about 11 semitones, speaking faster than 5.6 or slower than 2.6 syllables a second, or long dramatic pauses.

The line: one short sarcastic remark from the llama, max 14 words, about the performance only. Never mock anyone's real accent, nationality, ethnicity or fluency. PG. No emoji.`;

export async function POST(req: Request) {
  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const facts = {
    target_accent: LANGS[body.lang].label,
    suggested_phrase: body.phrase ?? '(none chosen)',
    recognizer_transcript: body.transcript || '(nothing recognized)',
    recognizer_confidence: body.confidence ?? 'not reported',
    seconds_of_speech: body.speechSec,
    pitch_range_semitones: body.pitchRangeSemitones,
    syllables_per_second: body.syllablesPerSec,
    pause_ratio: body.pauseRatio,
  };

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: zodOutputFormat(VerdictSchema) },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Facts (JSON): ${JSON.stringify(facts)}\n\nGive your verdict.` }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return NextResponse.json({ error: 'The llama declined to judge.' }, { status: 502 });
    }
    return NextResponse.json({ ok: response.parsed_output.ok, line: response.parsed_output.line.trim().slice(0, 140) });
  } catch (err) {
    if (err instanceof Error && /authentication method/i.test(err.message)) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set.' }, { status: 503 });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'The Claude API key was rejected.' }, { status: 503 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'Claude is rate limited.' }, { status: 429 });
    }
    console.error('Verdict error', err);
    return NextResponse.json({ error: 'The llama lost the plot.' }, { status: 502 });
  }
}
