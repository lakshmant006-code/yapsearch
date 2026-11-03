// The (fictional, scientifically unserious) scoring, plus the template
// "clerk" that writes allegations when Claude is unavailable. Pure functions.

import { MARKERS, PERSONAS, type AccentId, type PersonaId } from './data';

export interface AudioFacts {
  durationSec: number;
  speechSec: number;
  pauseRatio: number;
  pitchRangeSemitones: number;
  medianPitchHz: number;
  syllablesPerSec: number;
}

export interface TextFacts {
  hits: Record<string, number>;
  byAccent: Partial<Record<Exclude<AccentId, 'none'>, number>>;
  unique: Exclude<AccentId, 'none'>[]; // accents hit by a word no other accent uses
  glottal: number; // "wa'er", "bo'le"
  words: number;
}

export interface Evidence {
  accent: AccentId | null;
  said: string;
  audio: AudioFacts | null;
  text: TextFacts;
}

export interface Judgement {
  score: number;
  persona: PersonaId;
  tier: string;
  drama: string;
  quality: string;
}

/** The allegation fields Claude (or the clerk) writes. */
export interface Allegations {
  observation: string;
  influence: string;
  drama: string;
  quality: string;
  charge: string;
  sentence: string;
}

export interface Report extends Allegations {
  no: number;
  date: string;
  score: number;
  tier: string;
  persona: PersonaId;
  head: string;
  sub: string;
  by: string;
  exhibits: [string, string][];
}

export function countMarkers(text: string): TextFacts {
  const t = ' ' + text.toLowerCase().replace(/’/g, "'").replace(/[^a-z'àâçéèêëîïôûùüÿœ ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const hits: Record<string, number> = {};
  const byAccent: TextFacts['byAccent'] = {};
  const unique = new Set<Exclude<AccentId, 'none'>>();
  const entries = Object.entries(MARKERS) as [Exclude<AccentId, 'none'>, string[]][];
  for (const [acc, words] of entries) {
    for (const w of words) {
      const n = t.split(' ' + w + ' ').length - 1;
      if (n === 0) continue;
      hits[w] = Math.max(hits[w] ?? 0, n);
      byAccent[acc] = (byAccent[acc] ?? 0) + n;
      if (!entries.some(([o, ws]) => o !== acc && ws.includes(w))) unique.add(acc);
    }
  }
  const glottal = (text.match(/\b\w+['’]\w*(er|le|el|en)\b/gi) ?? []).filter(
    (w) => !/n['’]t|['’](ll|re|ve|s|d|m)$/i.test(w),
  ).length;
  return { hits, byAccent, unique: Array.from(unique), glottal, words: text.trim() ? text.trim().split(/\s+/).length : 0 };
}

export function judge(ev: Evidence): Judgement {
  const m = ev.text;
  const totalHits = Object.values(m.hits).reduce((a, b) => a + b, 0);
  const attempted = !!ev.accent && ev.accent !== 'none';
  let score = 12;
  score += Math.min(45, totalHits * 9);
  score += Math.min(18, m.glottal * 6);
  if (attempted) score += 12;
  const a = ev.audio;
  if (a) {
    score += Math.max(0, Math.min(20, (a.pitchRangeSemitones - 6) * 3));
    if (a.syllablesPerSec > 5.5) score += 6;
    if (a.syllablesPerSec > 0 && a.syllablesPerSec < 2.8) score += 8;
  }
  const others = m.unique.filter((x) => x !== ev.accent);
  const smuggling = attempted ? others.length >= 2 : m.unique.length >= 2;
  if (smuggling) score += 10;
  if (ev.accent === 'none') score -= 8;
  score = Math.max(3, Math.min(99, Math.round(score)));

  const top = (Object.entries(m.byAccent) as [Exclude<AccentId, 'none'>, number][]).sort((x, y) => y[1] - x[1])[0];
  let persona: PersonaId;
  if (score < 30) persona = 'none';
  else if (smuggling) persona = 'mixed';
  else if (attempted) persona = ev.accent as PersonaId;
  else if (m.unique.length === 1) persona = m.unique[0];
  else if (top) persona = top[0];
  else persona = 'unclear';

  const tier = score < 21 ? 'Suspiciously normal' : score < 46 ? 'Mildly performed' : score < 71 ? 'Community theatre' : score < 91 ? 'Highly theatrical' : 'West End revival';
  const drama = score < 30 ? 'Mild' : score < 55 ? 'Moderate' : score < 80 ? 'Severe' : 'Critical';
  const quality = !a ? 'Hearsay' : a.speechSec < 5 ? 'Questionable' : a.speechSec < 15 ? 'Circumstantial' : 'Admissible, sadly';
  return { score, persona, tier, drama, quality };
}

const TIMES = ['zero times', 'once', 'twice', 'three times', 'four times', 'five times', 'six times', 'seven times'];
const times = (n: number) => TIMES[n] ?? `${n} times`;

/** Template allegations, used when Claude is off or unavailable. */
export function clerkAllegations(ev: Evidence, j: Judgement): Allegations {
  const p = PERSONAS[j.persona];
  const parts: string[] = [];
  const hits = Object.entries(ev.text.hits).sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (hits.length) parts.push('You said ' + hits.map(([w, n]) => `“${w}” ${times(n)}`).join(' and ') + '.');
  if (ev.text.glottal) parts.push(`We counted ${ev.text.glottal} apostrophe${ev.text.glottal > 1 ? 's' : ''} where a perfectly good T used to live.`);
  const a = ev.audio;
  if (a && a.pitchRangeSemitones >= 9) parts.push(`Your pitch travelled ${a.pitchRangeSemitones} semitones, which is more range than most musicals.`);
  else if (a && a.pitchRangeSemitones > 0 && a.pitchRangeSemitones < 4) parts.push(`Your pitch stayed within ${a.pitchRangeSemitones} semitones. Either very calm or very rehearsed.`);
  if (a && a.syllablesPerSec > 5.5) parts.push(`At ${a.syllablesPerSec} syllables a second, you were clearly trying to finish before the accent wore off.`);
  if (a && a.syllablesPerSec > 0 && a.syllablesPerSec < 2.8) parts.push(`At ${a.syllablesPerSec} syllables a second, you savoured every vowel like it was imported.`);
  if (ev.accent === 'none' && j.persona !== 'none') parts.push('You told us this is just how you talk. Noted. Underlined. Circled.');
  if (parts.length && j.persona === 'none') parts.push('None of this is illegal. Yet.');
  if (!parts.length) parts.push(j.persona === 'none' ? 'Nothing in the evidence raised an eyebrow. We checked twice. We are disappointed.' : 'The evidence was thin, but our instincts are not.');
  const seed = ev.said.length + (a ? Math.round(a.speechSec * 10) : 0);
  return {
    observation: (parts.slice(0, 3).join(' ') + ' ' + p.kicker).trim(),
    influence: p.influences[seed % p.influences.length],
    drama: j.drama,
    quality: j.quality,
    charge: p.charge,
    sentence: p.sentence,
  };
}

export function exhibitsFor(ev: Evidence): [string, string][] {
  const out: [string, string][] = [];
  if (ev.audio) {
    out.push(['Speech', `${ev.audio.speechSec} s`]);
    if (ev.audio.pitchRangeSemitones) out.push(['Pitch range', `${ev.audio.pitchRangeSemitones} st`]);
    if (ev.audio.syllablesPerSec) out.push(['Pace', `${ev.audio.syllablesPerSec} syl/s`]);
  }
  if (ev.said) out.push(['Suspect words', String(Object.values(ev.text.hits).reduce((a, b) => a + b, 0))]);
  if (ev.text.glottal) out.push(['Missing T’s', String(ev.text.glottal)]);
  return out;
}

export function allegationText(r: Report): string {
  return [
    `F.A.K.E. · Accent Crimes Division · Report #${String(r.no).padStart(4, '0')}`,
    `Accent suspicion level: ${r.score}% (${r.tier})`,
    `${r.head} ${r.sub}`,
    r.observation,
    `Suspected influence: ${r.influence} · Vowel drama: ${r.drama} · Evidence quality: ${r.quality}`,
    `${r.persona === 'none' ? 'NOT GUILTY' : 'FOUND GUILTY'} ${r.charge}`,
    r.sentence,
    'Fictional score. Scientifically unserious. We don’t believe a word you accent.',
  ].join('\n');
}
