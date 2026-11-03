// Copy and word lists for F.A.K.E. Everything here is satire: the word lists
// are tells of a *performed* accent, not markers of anyone's real one.

export type AccentId = 'british' | 'american' | 'australian' | 'french' | 'italian' | 'none';
export type PersonaId = Exclude<AccentId, 'none'> | 'unclear' | 'mixed' | 'none';

export const ACCENTS: { id: AccentId; label: string }[] = [
  { id: 'british', label: 'British' },
  { id: 'american', label: 'American' },
  { id: 'australian', label: 'Australian' },
  { id: 'french', label: 'French' },
  { id: 'italian', label: 'Italian' },
  { id: 'none', label: 'This is just how I talk' },
];

export const PHRASES = [
  'Can I get a bottle of water?',
  'I literally just got back from London.',
  'No, this is actually how I talk.',
  'Bro, I’ve always sounded like this.',
  'It’s not an accent. It’s a personality.',
];

// Words that raise eyebrows when said by someone who has "always talked like this".
export const MARKERS: Record<Exclude<AccentId, 'none'>, string[]> = {
  british: ['cheers', 'mate', 'innit', 'bloody', 'brilliant', 'proper', 'lovely', 'quid', 'rubbish', 'fancy', 'loo', 'queue', 'knackered', 'bruv', 'blimey', 'cuppa', 'london', 'posh', 'reckon'],
  american: ['awesome', 'dude', 'totally', "y'all", 'gonna', 'wanna', 'gotten', 'buddy', 'howdy', 'sidewalk', 'soda'],
  australian: ['mate', "g'day", 'arvo', 'heaps', 'reckon', 'servo', 'brekkie', 'no worries', 'crikey', 'barbie', 'fair dinkum', 'sheila'],
  french: ['bonjour', 'oui', 'merci', 'voila', 'voilà', 'baguette', 'zis', 'ze', 'zat', 'non', 'mon ami', 'croissant', 'ooh la la', 'oh la la', 'très', "c'est"],
  italian: ['mamma mia', 'ciao', 'bella', 'bellissimo', 'prego', 'grazie', 'pasta', 'amore', 'capisce', 'allora', 'andiamo', 'espresso'],
};

export interface Persona {
  head: string;
  sub: string;
  charge: string;
  sentence: string;
  influences: string[];
  kicker: string;
}

export const PERSONAS: Record<PersonaId, Persona> = {
  british: { head: 'The Crown called.', sub: 'They want their vowels back.', charge: 'of excessive Britishness.', sentence: 'Sentence: 30 days without saying “innit.”', influences: ['British Netflix', 'One Guy Ritchie film', 'A gap week in Shoreditch'], kicker: 'Your phone still autocorrects to American English.' },
  american: { head: 'Hollywood has entered the chat.', sub: 'You’ve watched one too many coming-of-age films.', charge: 'of unlicensed Hollywood.', sentence: 'Sentence: one full sentence without “literally.”', influences: ['Teen dramas', 'A road trip montage', 'Customer-service voice'], kicker: 'Somewhere, a director is shouting “cut.”' },
  australian: { head: 'That’s a lot of mate, mate.', sub: 'Your accent appears to have taken a gap year.', charge: 'of aggravated mate-ing.', sentence: 'Sentence: 14 days of saying “afternoon” in full.', influences: ['A working holiday visa', 'Surf documentaries', 'One Bondi weekend'], kicker: 'The kangaroos have not been informed.' },
  french: { head: 'Bonjour, Beyoncé.', sub: 'The pronunciation is giving three Duolingo lessons.', charge: 'of first-degree Francophilia.', sentence: 'Sentence: return all borrowed “zis” and “zat.”', influences: ['Three Duolingo lessons', 'A croissant you once had', 'Ratatouille (2007)'], kicker: 'Paris has not been consulted.' },
  italian: { head: 'The hands are doing most of the talking.', sub: 'Your pronunciation deserves its own dramatic soundtrack.', charge: 'of operatic hand gestures.', sentence: 'Sentence: sit on both hands for one full sentence.', influences: ['A pasta commercial', 'One week in Rome', 'Opera highlights'], kicker: 'Nonna would like a word.' },
  unclear: { head: 'International waters.', sub: 'Your vowels have refused to disclose their nationality.', charge: 'of refusing to state a nationality.', sentence: 'Sentence: pick a hemisphere and stay there.', influences: ['Airport lounges', 'Unknown', 'Five podcasts at 2x speed'], kicker: 'The vowels have asked for asylum.' },
  mixed: { head: 'Your accent has frequent flyer miles.', sub: 'Five countries. One sentence. No luggage.', charge: 'of international vowel smuggling.', sentence: 'Sentence: declare all vowels at customs.', influences: ['Every airline’s safety video', 'A study-abroad group chat', 'International Netflix'], kicker: 'Customs would like to see your receipts.' },
  none: { head: 'Case dismissed.', sub: 'We found nothing. Our algorithm is devastated.', charge: 'of anything, annoyingly.', sentence: 'Sentence: none. Go about your day.', influences: ['Your actual upbringing', 'Nothing suspicious', 'Being normal, allegedly'], kicker: '' },
};

export const STAGES = [
  'Interrogating your vowels…',
  'Cross-examining your consonants…',
  'Dusting the T’s for glottal fingerprints…',
  'Checking the passport stamps on your R’s…',
  'Measuring eyebrow involvement…',
  'Consulting a panel of disappointed linguists…',
];
