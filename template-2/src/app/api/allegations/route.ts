import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ACCENTS, PERSONAS, type AccentId } from '@/lib/fake/data';
import { countMarkers, judge, type Allegations, type AudioFacts, type Evidence } from '@/lib/fake/judge';

// Claude writes the allegations. It never hears the audio: the browser
// measures the voice memo, and Claude gets those numbers plus the words.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = process.env.FAKE_CLAUDE_MODEL || 'claude-opus-5-5';

const AllegationsSchema = z.object({
  observation: z.string().describe('2-3 sentences, max 50 words: the case officer’s finding, citing specific evidence'),
  suspectedInfluence: z.string().describe('2-5 words, e.g. British Netflix'),
  vowelDrama: z.string().describe('1-2 words, e.g. Severe'),
  evidenceQuality: z.string().describe('1-3 words, e.g. Questionable'),
  charge: z.string().describe('Starts with "of ", ends with a period, max 8 words, e.g. of excessive Britishness.'),
  sentence: z.string().describe('Starts with "Sentence: ", max 14 words, an absurd punishment'),
});

const RequestSchema = z.object({
  accent: z.enum(['british', 'american', 'australian', 'french', 'italian', 'none']).nullable(),
  said: z.string().max(1000),
  gentle: z.boolean().optional(),
  audio: z
    .object({
      durationSec: z.number().min(0).max(120),
      speechSec: z.number().min(0).max(120),
      pauseRatio: z.number().min(0).max(1),
      pitchRangeSemitones: z.number().min(0).max(60),
      medianPitchHz: z.number().min(0).max(1000),
      syllablesPerSec: z.number().min(0).max(20),
    })
    .nullable(),
});

const SYSTEM = `You write the results for F.A.K.E. (Foreign Accent Knowledge Examiner), a satirical app that pretends to investigate whether someone is putting on an accent.

Voice: a very serious government investigation into a completely unserious crime. Deadpan, official-sounding, absurdly confident, slightly unhinged. Think Duolingo meets a lie detector meets an unnecessarily judgmental AI.

Rules:
- The joke is always the performance: exaggerated, borrowed or newly acquired accents. Never joke about anyone's real accent, ethnicity, nationality or English fluency. No stereotypes about people or countries beyond light pop-culture references. Keep it PG.
- Use only the facts you are given. Quote their actual words and numbers where it's funny. Never invent things they said.
- Plain sentences. No emoji, no hashtags.`;

export async function POST(req: Request) {
  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid evidence submitted.' }, { status: 400 });
  }

  // Recompute the verdict here rather than trusting the client's.
  const ev: Evidence = {
    accent: body.accent as AccentId | null,
    said: body.said.trim(),
    audio: body.audio as AudioFacts | null,
    text: countMarkers(body.said),
  };
  const j = judge(ev);
  const persona = PERSONAS[j.persona];

  const facts = {
    accent_admitted: ev.accent ? ACCENTS.find((a) => a.id === ev.accent)?.label : 'not stated',
    what_they_said: ev.said || '(no text submitted)',
    suspicious_words_and_counts: ev.text.hits,
    glottal_apostrophes: ev.text.glottal,
    audio: ev.audio
      ? {
          seconds_of_speech: ev.audio.speechSec,
          pitch_range_semitones: ev.audio.pitchRangeSemitones,
          syllables_per_second: ev.audio.syllablesPerSec,
          pause_ratio: ev.audio.pauseRatio,
        }
      : 'no voice memo submitted',
    suspicion_score: j.score,
    result_type: j.persona,
    headline: persona.head,
    subhead: persona.sub,
  };

  const prompt = [
    `Facts (JSON): ${JSON.stringify(facts)}`,
    body.gentle ? 'Leniency was requested: be teasing, not harsh.' : 'Be judgmental, but affectionate.',
    j.persona === 'none'
      ? 'This person was found NOT guilty. The charge should read like being cleared of nothing, and the sentence should be no punishment.'
      : 'This person was found guilty. Write charges and a sentence that match the result type.',
    'Write the allegations.',
  ].join('\n\n');

  const client = new Anthropic();

  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: zodOutputFormat(AllegationsSchema) },
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return NextResponse.json({ error: 'Claude declined to file charges.' }, { status: 502 });
    }
    const o = response.parsed_output;
    const allegations: Allegations = {
      observation: o.observation.slice(0, 400),
      influence: o.suspectedInfluence.slice(0, 60),
      drama: o.vowelDrama.slice(0, 30),
      quality: o.evidenceQuality.slice(0, 40),
      charge: o.charge.slice(0, 90),
      sentence: o.sentence.slice(0, 140),
    };
    return NextResponse.json(allegations);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'The Claude API key was rejected.' }, { status: 503 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'Claude is rate limited. Try again shortly.' }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error('Claude API error', err.status, err.message);
      return NextResponse.json({ error: 'Claude is on a coffee break.' }, { status: 502 });
    }
    // No API key or other credential configured: the SDK throws before sending.
    if (err instanceof Error && /authentication method/i.test(err.message)) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set.' }, { status: 503 });
    }
    console.error('Allegations error', err);
    return NextResponse.json({ error: 'Our detective has lost the plot.' }, { status: 500 });
  }
}
