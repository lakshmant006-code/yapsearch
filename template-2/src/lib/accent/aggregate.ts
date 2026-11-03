import type { AccentAnalysis, Confidence, PrecisionReport, RunAnalysis, SegmentProbe, Verdict } from './types';

// Turns several independent model judgements plus per-segment accent-strength
// probes into one verdict. The rules are deliberately conservative: a definite
// verdict needs the independent runs to agree AND the combined score to be
// clearly on one side. Anything else is reported as "uncertain".

export const FAKE_MAX_SCORE = 40;
export const AUTHENTIC_MIN_SCORE = 60;
const MIN_AGREEMENT = 0.6;

export interface AggregateOptions {
  targetAccent: string;
  speechSec: number;
}

export function aggregate(runs: RunAnalysis[], probes: SegmentProbe[], opts: AggregateOptions): AccentAnalysis {
  if (runs.length === 0) throw new Error('aggregate() needs at least one run');
  const reasons: string[] = [];

  const runScores = runs.map((r) => r.authenticityScore);
  const runVerdicts = runs.map((r) => r.verdict);
  const modelScore = Math.round(median(runScores));
  const scoreSpread = Math.max(...runScores) - Math.min(...runScores);
  const { value: majority, share: agreement } = mode(runVerdicts);

  // --- Segment drift: does the accent hold steady through the clip? ---
  let segmentDrift: number | null = null;
  let segmentTrend: number | null = null;
  let driftPenalty = 0;
  let consistencyScore = Math.round(median(runs.map((r) => r.consistencyScore)));

  if (probes.length >= 2) {
    const strengths = probes.map((p) => p.targetStrength);
    segmentDrift = round1(stdDev(strengths));
    const third = Math.max(1, Math.floor(strengths.length / 3));
    segmentTrend = round1(mean(strengths.slice(-third)) - mean(strengths.slice(0, third)));
    consistencyScore = clamp(100 - 2 * segmentDrift - Math.max(0, -segmentTrend));

    // Drift only means something if the speaker actually produced the accent
    // somewhere; if it never appears, the low strength is not "drift".
    if (Math.max(...strengths) >= 40) {
      driftPenalty = Math.round(
        clampRange((segmentDrift - 10) * 1.0, 0, 20) + clampRange((-segmentTrend - 15) * 0.5, 0, 15),
      );
    }
    if (driftPenalty > 0) {
      reasons.push(
        `The accent's strength varied across the clip (spread ±${segmentDrift}` +
          (segmentTrend < -15 ? `, fading by ${Math.abs(segmentTrend)} points toward the end` : '') +
          `), which lowered the score by ${driftPenalty}.`,
      );
    } else {
      reasons.push('The accent held steady across every segment.');
    }
  } else {
    reasons.push('The clip was too short to split into segments, so drift could not be measured.');
  }

  const authenticityScore = clamp(modelScore - driftPenalty);

  // --- Verdict rules ---
  let verdict: Verdict = 'uncertain';
  const runsAgree = agreement >= MIN_AGREEMENT;
  const agreed = `${Math.round(agreement * runs.length)} of ${runs.length} independent listens agreed (scores ${runScores.join(', ')}).`;
  if (runsAgree && majority === 'likely_fake' && authenticityScore <= FAKE_MAX_SCORE) {
    verdict = 'likely_fake';
    reasons.unshift(agreed);
  } else if (runsAgree && majority === 'authentic' && authenticityScore >= AUTHENTIC_MIN_SCORE && driftPenalty < 10) {
    verdict = 'authentic';
    reasons.unshift(agreed);
  } else if (driftPenalty >= 15 && authenticityScore <= 50) {
    verdict = 'likely_fake';
    reasons.push(
      `The full-clip listens alone were not conclusive (scores ${runScores.join(', ')}), but the accent drifted strongly within the clip, which is a reliable sign of a put-on accent.`,
    );
  }

  if (verdict === 'uncertain') {
    if (!runsAgree || majority === 'uncertain') {
      reasons.push(`The ${runs.length} independent listens did not agree, so no verdict is given.`);
    } else {
      reasons.push(
        `The score (${authenticityScore}) is between ${FAKE_MAX_SCORE} and ${AUTHENTIC_MIN_SCORE}, or contradicts the drift check, so no verdict is given.`,
      );
    }
  }

  // --- Confidence ---
  let confidence: Confidence = 'low';
  if (agreement === 1 && scoreSpread <= 15 && opts.speechSec >= 20 && probes.length >= 2) confidence = 'high';
  else if (runsAgree && scoreSpread <= 30) confidence = 'medium';
  if (opts.speechSec < 20 && confidence === 'high') confidence = 'medium';
  if (scoreSpread > 30) reasons.push(`Run scores spread by ${scoreSpread} points, which lowers confidence.`);

  // Pick the run closest to the final score (preferring ones that match the
  // verdict) for the narrative parts: summary, evidence, tips, transcript.
  const candidates = runs.filter((r) => r.verdict === verdict);
  const pool = candidates.length ? candidates : runs;
  const rep = pool.reduce((best, r) =>
    Math.abs(r.authenticityScore - authenticityScore) < Math.abs(best.authenticityScore - authenticityScore) ? r : best,
  );

  const perceivedAccent = modeString(runs.map((r) => r.perceivedAccent)) ?? rep.perceivedAccent;
  const nativeGuesses = runs.map((r) => r.likelyNativeAccent).filter((x): x is string => !!x);
  const likelyNativeAccent = verdict === 'authentic' ? null : modeString(nativeGuesses) ?? null;

  const segmentSlips = probes.flatMap((p) => p.leaks.map((l) => `${fmt(p.start)}–${fmt(p.end)}: ${l}`));
  const slips = dedupe([...rep.slips, ...segmentSlips]).slice(0, 10);

  const precision: PrecisionReport = {
    runScores,
    runVerdicts,
    agreement: round1(agreement),
    scoreSpread,
    modelScore,
    driftPenalty,
    segmentDrift,
    segmentTrend,
    reasons,
  };

  return {
    verdict,
    authenticityScore,
    confidence,
    targetAccent: opts.targetAccent,
    perceivedAccent,
    likelyNativeAccent,
    consistencyScore,
    summary: rep.summary,
    evidence: rep.evidence,
    slips,
    coachingTips: rep.coachingTips,
    transcript: rep.transcript,
    segments: probes,
    precision,
  };
}

// ---------- small helpers ----------

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function stdDev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}
function clampRange(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function clamp(n: number): number {
  return Math.round(clampRange(n, 0, 100));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}
function dedupe(xs: string[]): string[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.toLowerCase().trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Most common value; ties resolve to "uncertain" for verdicts. */
function mode(xs: Verdict[]): { value: Verdict; share: number } {
  const counts = new Map<Verdict, number>();
  xs.forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1));
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return { value: 'uncertain', share: sorted[0][1] / xs.length };
  return { value: sorted[0][0], share: sorted[0][1] / xs.length };
}

function modeString(xs: string[]): string | null {
  if (!xs.length) return null;
  const counts = new Map<string, { n: number; original: string }>();
  for (const x of xs) {
    const k = x.toLowerCase().replace(/\(.*?\)/g, '').trim();
    const c = counts.get(k);
    counts.set(k, { n: (c?.n ?? 0) + 1, original: c?.original ?? x });
  }
  return Array.from(counts.values()).sort((a, b) => b.n - a.n)[0].original;
}
