// The three accents the llama judges, with suggested phrases and its
// fallback one-liners. Satire: it roasts put-on accents, never real ones.

export type LangId = 'en' | 'fr' | 'it';

export interface Lang {
  label: string;
  speechLang: string; // BCP-47 tag for the browser's speech recognition
  phrases: string[];
  ok: string[];
  fake: string[];
}

export const LANGS: Record<LangId, Lang> = {
  en: {
    label: 'English',
    speechLang: 'en-GB',
    phrases: ['Fancy a cup of tea?', 'It’s raining again. Brilliant.', 'Could I get a bottle of water?', 'I’m absolutely knackered.'],
    ok: ['Ugh. Fine. That was annoyingly British.', 'Tea has been approved. Grudgingly.'],
    fake: ['That accent has never paid for a Tube ticket.', 'The King has been notified. He sighed.', 'Two weeks in London does not count.'],
  },
  fr: {
    label: 'French',
    speechLang: 'fr-FR',
    phrases: ['Bonjour, je voudrais un croissant.', 'C’est la vie.', 'Où est la bibliothèque ?', 'Je ne parle pas très bien français.'],
    ok: ['Oui. Annoyingly, that was French.', 'The beret stays on. For now.'],
    fake: ['That wasn’t French. That was a croissant doing an impression.', 'Paris heard that and closed for lunch.', 'Three Duolingo lessons detected.'],
  },
  it: {
    label: 'Italian',
    speechLang: 'it-IT',
    phrases: ['Ciao, come stai?', 'Vorrei un espresso, per favore.', 'Mamma mia, che bello!', 'Dov’è il Colosseo?'],
    ok: ['Va bene. The hands may rest.', 'Nonna nodded. Once.'],
    fake: ['Nonna heard that and put the pasta down.', 'That was a pizza commercial, not Italian.', 'The hands were doing all the work.'],
  },
};

export const LISTEN_LINES = ['Go on then…', 'I’m listening. Unfortunately.', 'Mm-hm. Sure.', 'Every vowel is evidence.'];

export interface Hearing {
  lang: LangId;
  transcript: string; // what the browser's speech recognition heard, in the target language
  confidence: number | null; // 0-1 from speech recognition, null when unavailable
  phrase: string | null;
  speechSec: number;
  pitchRangeSemitones: number;
  syllablesPerSec: number;
  pauseRatio: number;
}

/**
 * House rule, used when Claude is unavailable. The main signal is how sure a
 * recognizer set to the target language was about what it heard; theatrical
 * pitch, rushing or crawling count as performing.
 */
export function houseRule(h: Hearing): boolean {
  let sus = 0;
  if (h.confidence !== null && h.confidence > 0) {
    if (h.confidence < 0.6) sus += 2;
    else if (h.confidence < 0.78) sus += 1;
  }
  if (h.speechSec > 1.5 && !h.transcript.trim()) sus += 2;
  if (h.pitchRangeSemitones > 11) sus += 2;
  else if (h.pitchRangeSemitones > 8) sus += 1;
  if (h.syllablesPerSec > 5.6 || (h.syllablesPerSec > 0 && h.syllablesPerSec < 2.6)) sus += 1;
  if (h.pauseRatio > 0.55) sus += 1;
  return sus < 2;
}

export const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
