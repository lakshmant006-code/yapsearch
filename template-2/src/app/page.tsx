'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square, Upload, Loader2, RotateCcw, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import { prepareAudio, MAX_SECONDS, MIN_SPEECH_SECONDS, type PreparedAudio } from '@/lib/audio/wav';
import { FAKE_MAX_SCORE, AUTHENTIC_MIN_SCORE } from '@/lib/accent/aggregate';
import type { AccentAnalysis, AccentEvidence, Verdict } from '@/lib/accent/types';

const ACCENT_PRESETS = [
  'British (RP)',
  'Cockney',
  'Scottish',
  'Irish',
  'Australian',
  'Southern US',
  'New York',
  'Boston',
  'French',
  'Russian',
  'Indian English',
  'Jamaican',
];

// The Speech Accent Archive elicitation paragraph: it packs in most English
// sounds, so it's a good fixed text for comparing accents.
const READING_PASSAGE =
  'Please call Stella. Ask her to bring these things with her from the store: six spoons of fresh snow peas, five thick slabs of blue cheese, and maybe a snack for her brother Bob. We also need a small plastic snake and a big toy frog for the kids. She can scoop these things into three red bags, and we will go meet her Wednesday at the train station.';

type Phase = 'idle' | 'recording' | 'checking' | 'ready' | 'analyzing' | 'done';

const VERDICT_STYLE: Record<Verdict, { label: string; color: string; bg: string; Icon: typeof CheckCircle2 }> = {
  authentic: { label: 'Sounds authentic', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', Icon: CheckCircle2 },
  likely_fake: { label: 'Probably put on', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200', Icon: AlertTriangle },
  uncertain: { label: 'Hard to tell', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', Icon: HelpCircle },
};

export default function Home() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [claimedAccent, setClaimedAccent] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<AccentAnalysis | null>(null);
  const [prepared, setPrepared] = useState<PreparedAudio | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => stopMedia(), []);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  function stopMedia() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    timerRef.current = null;
    rafRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    setLevel(0);
  }

  // Decode and quality-check the clip as soon as we have it, so problems
  // show up before the user waits on an analysis.
  async function setClip(blob: Blob) {
    setAudioBlob(blob);
    setAudioUrl(URL.createObjectURL(blob));
    setResult(null);
    setPrepared(null);
    setPhase('checking');
    try {
      const p = await prepareAudio(blob);
      setPrepared(p);
      if (p.truncated) setNotice(`Only the first ${MAX_SECONDS} seconds will be analyzed.`);
    } catch {
      setError("Couldn't decode that audio. Try WAV, MP3 or M4A.");
    }
    setPhase('ready');
  }

  async function startRecording() {
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Live input level meter.
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += ((buf[i] - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        stopMedia();
        setClip(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorderRef.current = recorder;
      recorder.start();

      const startedAt = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        const s = (Date.now() - startedAt) / 1000;
        setElapsed(s);
        if (s >= MAX_SECONDS) stopRecording();
      }, 200);
      setPhase('recording');
    } catch (e) {
      stopMedia();
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it in your browser, or upload a file instead.'
          : 'Could not start the microphone.',
      );
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setNotice(null);
    setClip(file);
  }

  async function analyze() {
    if (!prepared || prepared.quality.blocking) return;
    setError(null);
    setPhase('analyzing');
    try {
      const res = await fetch('/api/accent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: prepared.base64,
          claimedAccent,
          segments: prepared.segments,
          speechSec: prepared.quality.speechSec,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setResult(data as AccentAnalysis);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
      setPhase('ready');
    }
  }

  function reset() {
    stopMedia();
    setAudioBlob(null);
    setAudioUrl(null);
    setPrepared(null);
    setResult(null);
    setError(null);
    setNotice(null);
    setElapsed(0);
    setPhase('idle');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 flex items-center px-6 z-50">
        <h1 className="text-2xl font-serif text-gray-900 tracking-tight">Accent Detector</h1>
      </div>

      <main className="max-w-2xl mx-auto px-4 pt-24 pb-16 space-y-6">
        <section className="text-center space-y-2">
          <h2 className="text-3xl sm:text-4xl font-serif text-gray-900">Is that accent real?</h2>
          <p className="text-gray-600">
            Record someone talking (or upload a clip). The clip is listened to three separate times, and each ~10s
            stretch is checked on its own for drift. You only get a verdict when those checks agree.
          </p>
        </section>

        {/* Step 1: claimed accent */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <label htmlFor="claimed" className="block text-sm font-medium text-gray-900">
            Which accent are they going for? <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="claimed"
            value={claimedAccent}
            onChange={(e) => setClaimedAccent(e.target.value)}
            placeholder="e.g. Scottish, or leave blank to auto-detect"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
          />
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setClaimedAccent(claimedAccent === a ? '' : a)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  claimedAccent === a
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </section>

        {/* Step 2: audio */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <details className="group rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 list-none flex justify-between">
              Need something to say? Read this passage
              <span className="text-gray-400 group-open:rotate-180 transition-transform">⌄</span>
            </summary>
            <p className="mt-3 text-gray-700 leading-relaxed font-serif">{READING_PASSAGE}</p>
            <p className="mt-2 text-xs text-gray-500">
              For the most precise result: read the passage, then keep talking freely. 20–60 seconds in a quiet room
              is ideal. Fake accents usually slip in unscripted speech.
            </p>
          </details>

          <div className="flex flex-col items-center gap-4 py-4">
            {phase === 'recording' ? (
              <>
                <button
                  onClick={stopRecording}
                  className="relative w-24 h-24 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg hover:bg-rose-700 transition-colors"
                  aria-label="Stop recording"
                >
                  <span
                    className="absolute inset-0 rounded-full bg-rose-400/40 transition-transform duration-75"
                    style={{ transform: `scale(${1 + level * 0.5})` }}
                  />
                  <Square className="relative w-8 h-8 fill-current" />
                </button>
                <div className="text-center">
                  <div className="font-mono text-lg text-gray-900">
                    {formatTime(elapsed)} <span className="text-gray-400">/ {formatTime(MAX_SECONDS)}</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {elapsed < 20 ? 'Keep talking. 20s+ gives the best precision.' : 'Tap to stop when you’re done'}
                  </div>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={startRecording}
                  disabled={phase === 'analyzing' || phase === 'checking'}
                  className="w-24 h-24 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
                  aria-label="Start recording"
                >
                  <Mic className="w-9 h-9" />
                </button>
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>{audioBlob ? 'Record again' : 'Tap to record'}</span>
                  <span className="text-gray-300">or</span>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={phase === 'analyzing'}
                    className="inline-flex items-center gap-1.5 text-gray-700 hover:text-gray-900 underline-offset-2 hover:underline disabled:opacity-40"
                  >
                    <Upload className="w-4 h-4" /> upload a clip
                  </button>
                  <input ref={fileInputRef} type="file" accept="audio/*,video/*" className="hidden" onChange={onFileChosen} />
                </div>
              </>
            )}
          </div>

          {audioUrl && phase !== 'recording' && (
            <div className="space-y-3">
              <audio src={audioUrl} controls className="w-full" />
              {prepared && <QualityPanel prepared={prepared} />}
              <div className="flex gap-2">
                <button
                  onClick={analyze}
                  disabled={(phase !== 'ready' && phase !== 'done') || !prepared || prepared.quality.blocking}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 text-white py-3 font-medium hover:bg-gray-800 disabled:opacity-60"
                >
                  {phase === 'analyzing' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Listening 3× + checking segments…
                    </>
                  ) : phase === 'checking' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Checking audio quality…
                    </>
                  ) : prepared?.quality.blocking ? (
                    'Record a better clip to continue'
                  ) : (
                    'Analyze accent'
                  )}
                </button>
                <button
                  onClick={reset}
                  disabled={phase === 'analyzing'}
                  className="px-4 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  aria-label="Start over"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {notice && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{notice}</p>}
          {error && <p className="text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2">{error}</p>}
        </section>

        <AnimatePresence>{result && <Results result={result} claimedAccent={claimedAccent} />}</AnimatePresence>

        <p className="text-xs text-center text-gray-400 px-6">
          For fun and practice. Real accents vary with upbringing, travel and context, and the model can be wrong, so
          please don&apos;t use this to judge anyone&apos;s identity or background.
        </p>
      </main>
    </div>
  );
}

function Results({ result, claimedAccent }: { result: AccentAnalysis; claimedAccent: string }) {
  const style = VERDICT_STYLE[result.verdict];
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-4"
    >
      <div className={`rounded-2xl border p-5 ${style.bg}`}>
        <div className="flex items-start gap-5">
          <ScoreRing score={result.authenticityScore} verdict={result.verdict} />
          <div className="flex-1 min-w-0 space-y-1">
            <div className={`flex items-center gap-2 font-semibold text-lg ${style.color}`}>
              <style.Icon className="w-5 h-5 shrink-0" /> {style.label}
            </div>
            <p className="text-sm text-gray-700">
              Heard: <span className="font-medium text-gray-900">{result.perceivedAccent}</span>
              {claimedAccent && <span className="text-gray-500"> (going for {claimedAccent})</span>}
            </p>
            {result.verdict !== 'authentic' && result.likelyNativeAccent && (
              <p className="text-sm text-gray-700">
                Real accent peeking through:{' '}
                <span className="font-medium text-gray-900">{result.likelyNativeAccent}</span>
              </p>
            )}
            <p className="text-xs text-gray-500">
              <span className="capitalize">{result.confidence}</span> confidence
            </p>
          </div>
        </div>
        <p className="mt-4 text-gray-800 leading-relaxed">{result.summary}</p>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Consistency across the clip</span>
            <span>{result.consistencyScore}/100</span>
          </div>
          <div className="h-2 rounded-full bg-white/70 overflow-hidden">
            <motion.div
              className="h-full bg-gray-800 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${result.consistencyScore}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>

      <PrecisionPanel result={result} />

      {result.evidence.length > 0 && (
        <Card title="What gave it away">
          <ul className="divide-y divide-gray-100">
            {result.evidence.map((e, i) => (
              <EvidenceRow key={i} e={e} />
            ))}
          </ul>
        </Card>
      )}

      {result.slips.length > 0 && (
        <Card title="Slips">
          <ul className="space-y-2">
            {result.slips.map((s, i) => (
              <li key={i} className="text-sm text-gray-700 flex gap-2">
                <span className="text-rose-500">•</span>
                {s}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {result.coachingTips.length > 0 && (
        <Card title="Make it more convincing">
          <ol className="space-y-2 list-decimal list-inside">
            {result.coachingTips.map((t, i) => (
              <li key={i} className="text-sm text-gray-700">
                {t}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {result.transcript && (
        <Card title="Transcript">
          <p className="text-sm text-gray-600 font-serif leading-relaxed">“{result.transcript}”</p>
        </Card>
      )}
    </motion.section>
  );
}

function EvidenceRow({ e }: { e: AccentEvidence }) {
  const tag =
    e.pointsTo === 'fake'
      ? 'bg-rose-100 text-rose-700'
      : e.pointsTo === 'authentic'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-gray-100 text-gray-600';
  const label = e.pointsTo === 'fake' ? 'fake' : e.pointsTo === 'authentic' ? 'real' : 'neutral';
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-gray-900 text-sm">{e.feature}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${tag}`}>{label}</span>
      </div>
      <p className="text-sm text-gray-600 mt-1">{e.observation}</p>
    </li>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ScoreRing({ score, verdict }: { score: number; verdict: Verdict }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const stroke = verdict === 'authentic' ? '#059669' : verdict === 'likely_fake' ? '#e11d48' : '#d97706';
  return (
    <div className="relative w-20 h-20 shrink-0">
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="white" strokeWidth="8" />
        <motion.circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - score / 100) }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold text-gray-900">{score}</span>
        <span className="text-[10px] text-gray-500 -mt-1">real</span>
      </div>
    </div>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function QualityPanel({ prepared }: { prepared: PreparedAudio }) {
  const q = prepared.quality;
  const ok = q.issues.length === 0;
  const tone = q.blocking
    ? 'bg-rose-50 border-rose-200 text-rose-800'
    : ok
      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
      : 'bg-amber-50 border-amber-200 text-amber-800';
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tone}`}>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-medium">
        <span>{q.speechSec.toFixed(0)}s of speech</span>
        <span>Signal-to-noise {q.snrDb.toFixed(0)} dB</span>
        <span>{prepared.segments.length} segments for drift check</span>
      </div>
      {ok ? (
        <p className="mt-1">Good recording quality.</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {q.issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      {q.blocking && (
        <p className="mt-1 text-xs">
          Analysis is disabled for this clip because the result wouldn&apos;t be reliable (need {MIN_SPEECH_SECONDS}s+ of
          clear speech).
        </p>
      )}
    </div>
  );
}

function PrecisionPanel({ result }: { result: AccentAnalysis }) {
  const p = result.precision;
  return (
    <Card title="How sure is this?">
      <div className="space-y-4">
        <div>
          <div className="text-xs text-gray-500 mb-2">
            Independent listens (fake ≤ {FAKE_MAX_SCORE}, real ≥ {AUTHENTIC_MIN_SCORE})
          </div>
          <div className="relative h-8 rounded-lg bg-gradient-to-r from-rose-100 via-amber-50 to-emerald-100">
            <div className="absolute top-0 bottom-0 border-l border-dashed border-gray-400" style={{ left: `${FAKE_MAX_SCORE}%` }} />
            <div className="absolute top-0 bottom-0 border-l border-dashed border-gray-400" style={{ left: `${AUTHENTIC_MIN_SCORE}%` }} />
            {p.runScores.map((s, i) => (
              <div
                key={i}
                title={`Listen ${i + 1}: ${s}`}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-gray-500 ring-2 ring-white"
                style={{ left: `${s}%` }}
              />
            ))}
            <div
              title={`Final: ${result.authenticityScore}`}
              className="absolute top-0 bottom-0 w-1 -translate-x-1/2 bg-gray-900 rounded"
              style={{ left: `${result.authenticityScore}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-gray-400 mt-1">
            <span>put on</span>
            <span>
              grey dots = listens ({p.runScores.join(', ')}), bar = final {result.authenticityScore}
            </span>
            <span>native</span>
          </div>
        </div>

        {result.segments.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-2">
              Strength of {result.targetAccent} features in each segment
            </div>
            <div className="flex gap-1.5">
              {result.segments.map((s, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[11px] text-gray-600">{s.targetStrength}</span>
                  <div className="w-full h-20 flex items-end bg-gray-50 rounded-t">
                    <motion.div
                      className="w-full rounded-t bg-gray-800"
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(2, s.targetStrength)}%` }}
                      transition={{ duration: 0.6, delay: i * 0.05 }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400">{formatTime(s.start)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <ul className="text-sm text-gray-700 space-y-1">
          {p.reasons.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-gray-400">→</span>
              {r}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
