export type Verdict = 'authentic' | 'likely_fake' | 'uncertain';

export interface AccentEvidence {
  feature: string; // e.g. "Rhoticity", "TRAP-BATH split", "Intonation"
  observation: string; // what was actually heard, ideally quoting words
  pointsTo: 'authentic' | 'fake' | 'neutral';
}

export interface AccentAnalysis {
  verdict: Verdict;
  authenticityScore: number; // 0 = obviously put on, 100 = clearly native
  confidence: 'low' | 'medium' | 'high';
  perceivedAccent: string; // the accent the speaker is producing
  likelyNativeAccent: string | null; // what slips through, if put on
  consistencyScore: number; // 0-100, how steady the accent is across the clip
  summary: string;
  evidence: AccentEvidence[];
  slips: string[]; // specific moments where the "real" accent leaked out
  coachingTips: string[]; // how to make the accent more convincing
  transcript: string;
}

export interface AccentRequest {
  audioBase64: string; // 16 kHz mono WAV
  claimedAccent?: string;
}
