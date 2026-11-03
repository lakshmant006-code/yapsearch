export type Verdict = 'authentic' | 'likely_fake' | 'uncertain';
export type Confidence = 'low' | 'medium' | 'high';

export interface AccentEvidence {
  feature: string; // e.g. "Rhoticity", "TRAP-BATH split", "Intonation"
  observation: string; // what was actually heard, quoting words
  pointsTo: 'authentic' | 'fake' | 'neutral';
}

/** One independent full-clip judgement from the model. */
export interface RunAnalysis {
  verdict: Verdict;
  authenticityScore: number; // 0 = obviously put on, 100 = clearly native
  perceivedAccent: string;
  likelyNativeAccent: string | null;
  consistencyScore: number;
  summary: string;
  evidence: AccentEvidence[];
  slips: string[];
  coachingTips: string[];
  transcript: string;
}

/** How strongly one ~10s chunk shows the target accent. */
export interface SegmentProbe {
  start: number;
  end: number;
  targetStrength: number; // 0-100
  leaks: string[];
}

export interface PrecisionReport {
  runScores: number[];
  runVerdicts: Verdict[];
  agreement: number; // share of runs that agree with the majority verdict, 0-1
  scoreSpread: number; // max - min run score
  modelScore: number; // median run score
  driftPenalty: number; // points subtracted for accent drift across segments
  segmentDrift: number | null; // std-dev of segment strengths
  segmentTrend: number | null; // last-third minus first-third strength
  reasons: string[]; // plain-English explanation of the verdict rules that fired
}

export interface AccentAnalysis {
  verdict: Verdict;
  authenticityScore: number;
  confidence: Confidence;
  targetAccent: string;
  perceivedAccent: string;
  likelyNativeAccent: string | null;
  consistencyScore: number;
  summary: string;
  evidence: AccentEvidence[];
  slips: string[];
  coachingTips: string[];
  transcript: string;
  segments: SegmentProbe[];
  precision: PrecisionReport;
}

export interface AccentRequest {
  audioBase64: string; // 16 kHz mono 16-bit WAV
  claimedAccent?: string;
  segments?: { start: number; end: number }[];
  speechSec?: number;
}
