'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ACCENTS, PERSONAS, STAGES, type AccentId } from '@/lib/fake/data';
import {
  allegationText,
  clerkAllegations,
  countMarkers,
  exhibitsFor,
  judge,
  type Allegations,
  type Evidence,
  type Report,
} from '@/lib/fake/judge';
import { measureAudio, WAVE_DOTS, type MeasuredAudio } from '@/lib/fake/audio';

type View = 'boot' | 'welcome' | 'accent' | 'say' | 'wait' | 'result' | 'history';
const STEP: Record<View, number> = { boot: 0, welcome: 1, accent: 2, say: 3, wait: 3, result: 4, history: 4 };
const MAX_RECORD_SEC = 60;
const TRY_LINE = 'Cheers mate, can I get a bo’le of wa’er? I literally just got back from London.';

// Per-browser conveniences only; everything works if storage is blocked.
const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem('fake:' + k);
      return v == null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem('fake:' + k, JSON.stringify(v));
    } catch {}
  },
};
const pad = (n: number) => String(n).padStart(4, '0');

function Orb({ state, onClick, label, done }: { state?: 'busy' | 'rec'; onClick?: () => void; label?: string; done?: boolean }) {
  const cls = `orbwrap${done ? ' done' : ''}`;
  const inner = (
    <>
      <div className="orb" />
      {done && (
        <span className="badge">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
        </span>
      )}
    </>
  );
  return (
    <div className={state ?? undefined}>
      {onClick ? (
        <button type="button" className={cls} onClick={onClick} aria-label={label}>{inner}</button>
      ) : (
        <div className={cls} aria-hidden="true">{inner}</div>
      )}
    </div>
  );
}

function Wave({ levels, busy }: { levels?: number[] | null; busy?: boolean }) {
  return (
    <div className={`wave${busy ? ' busy-wave' : ''}`} aria-hidden="true">
      {Array.from({ length: WAVE_DOTS }, (_, i) => {
        const t = i / (WAVE_DOTS - 1);
        return (
          <i
            key={i}
            style={{
              background: `color-mix(in srgb, var(--deep) ${Math.round(t * 100)}%, color-mix(in srgb, var(--blue) 30%, var(--bg)))`,
              height: levels ? Math.max(6, Math.round((levels[i] ?? 0) * 24)) : undefined,
              animationDelay: busy ? `${i * 0.04}s` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>('boot');
  const [accent, setAccent] = useState<AccentId | null>(null);
  const [said, setSaid] = useState('');
  const [audio, setAudio] = useState<MeasuredAudio | null>(null);
  const [audioName, setAudioName] = useState('');
  const [recording, setRecording] = useState(false);
  const [live, setLive] = useState<number[] | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<Report[]>([]);
  const [armed, setArmed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const lastEvidence = useRef<Evidence | null>(null);
  const recorder = useRef<{ rec: MediaRecorder; stream: MediaStream; ctx: AudioContext; raf: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setHistory(store.get<Report[]>('history', []));
    setView(store.get('welcomed', false) ? 'say' : 'welcome');
    store.set('welcomed', true);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);
  useEffect(() => () => stopRecording(true), []); // eslint-disable-line react-hooks/exhaustive-deps

  const say = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  // ---------- evidence: microphone or file ----------
  async function takeClip(blob: Blob, name: string) {
    setMeasuring(true);
    setErr(null);
    try {
      const m = await measureAudio(blob);
      if (m.peak < 0.01 || m.speechSec < 0.4) {
        clearClip();
        setErr('The silence sounds suspiciously authentic. We heard nothing.');
      } else if (m.speechSec < 1.5) {
        clearClip();
        setErr('Three syllables? We’re detectives, not magicians.');
      } else {
        setAudio(m);
        setAudioName(name);
      }
    } catch {
      clearClip();
      setErr('We couldn’t open that recording. Try an MP3, M4A or WAV voice memo.');
    } finally {
      setMeasuring(false);
    }
  }

  function clearClip() {
    setAudio(null);
    setAudioName('');
  }

  async function startRecording() {
    setErr(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErr('Your microphone has trust issues. Allow it, or upload a voice memo instead.');
      return;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const levels: number[] = Array(WAVE_DOTS).fill(0);
    let lastPush = 0;
    const tick = (t: number) => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += ((buf[i] - 128) / 128) ** 2;
      if (t - lastPush > 70) {
        levels.shift();
        levels.push(Math.min(1, Math.sqrt(sum / buf.length) * 5));
        setLive([...levels]);
        lastPush = t;
      }
      if (recorder.current) recorder.current.raf = requestAnimationFrame(tick);
    };
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      if (chunks.length) takeClip(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), 'Recording');
    };
    recorder.current = { rec, stream, ctx, raf: requestAnimationFrame(tick), timer: setTimeout(() => stopRecording(), MAX_RECORD_SEC * 1000) };
    rec.start();
    clearClip();
    setRecording(true);
  }

  function stopRecording(discard = false) {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null;
    cancelAnimationFrame(r.raf);
    clearTimeout(r.timer);
    if (discard) r.rec.ondataavailable = null;
    if (r.rec.state !== 'inactive') r.rec.stop();
    r.stream.getTracks().forEach((t) => t.stop());
    r.ctx.close().catch(() => {});
    setRecording(false);
    setLive(null);
  }

  // ---------- investigation ----------
  async function investigate(ev: Evidence) {
    setView('wait');
    setStage(0);
    const ticker = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 900);
    const minimum = new Promise((r) => setTimeout(r, 3000));
    const j = judge(ev);
    const p = PERSONAS[j.persona];
    let allegations: Allegations = clerkAllegations(ev, j);
    let by = 'Written by our in-house clerk.';
    try {
      const res = await fetch('/api/allegations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accent: ev.accent,
          said: ev.said,
          audio: ev.audio && {
            durationSec: ev.audio.durationSec,
            speechSec: ev.audio.speechSec,
            pauseRatio: ev.audio.pauseRatio,
            pitchRangeSemitones: ev.audio.pitchRangeSemitones,
            medianPitchHz: ev.audio.medianPitchHz,
            syllablesPerSec: ev.audio.syllablesPerSec,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        allegations = data as Allegations;
        by = 'Allegations written by Claude, acting well outside its qualifications.';
      } else {
        by = `Written by our in-house clerk. ${data.error || 'Claude wasn’t available.'}`;
      }
    } catch {
      by = 'Written by our in-house clerk. Claude is on a coffee break.';
    }
    await minimum;
    clearInterval(ticker);
    const no = store.get('caseNo', 42);
    store.set('caseNo', no + 1);
    const r: Report = {
      ...allegations,
      no,
      date: new Date().toISOString().slice(0, 10),
      score: j.score,
      tier: j.tier,
      persona: j.persona,
      head: p.head,
      sub: p.sub,
      by,
      exhibits: exhibitsFor(ev),
    };
    const next = [r, ...store.get<Report[]>('history', [])].slice(0, 30);
    store.set('history', next);
    setHistory(next);
    setReport(r);
    setView('result');
  }

  function submit() {
    if (recording) stopRecording();
    const text = said.trim();
    const facts = countMarkers(text);
    if (!audio && !text) return setErr('No evidence yet. Tap the orb and talk, or type what you said.');
    if (!audio && facts.words < 3) return setErr('Three syllables? We’re detectives, not magicians. Type a full sentence.');
    setErr(null);
    const ev: Evidence = { accent, said: text, audio, text: facts };
    lastEvidence.current = ev;
    investigate(ev);
  }

  function newCase() {
    stopRecording(true);
    clearClip();
    setSaid('');
    setErr(null);
    setView('say');
  }

  async function copy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(allegationText(report));
      say('Copied. Use responsibly.');
    } catch {
      say('Copy refused. Select the text instead.');
    }
  }

  function back() {
    if (view === 'accent') setView('welcome');
    else if (view === 'say') {
      stopRecording(true);
      setView('accent');
    } else if (view === 'result' || view === 'history') setView('say');
  }

  const step = STEP[view];
  const innocent = report?.persona === 'none';
  const orbCaption = recording ? 'Listening. Tap to stop.' : measuring ? 'Collecting the vowels as evidence…' : 'Tap to talk';

  return (
    <div className="app">
      <div className="top">
        <button className="icon" type="button" aria-label="Back" onClick={back} disabled={view === 'welcome' || view === 'wait' || view === 'boot'}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <div className="bars" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => <i key={n} className={n <= step ? 'on' : ''} />)}
        </div>
        {(view === 'welcome' || view === 'accent') && (
          <button className="skip" type="button" onClick={() => setView('say')}>Skip</button>
        )}
      </div>

      {view === 'welcome' && (
        <section className="screen">
          <h1>Oh, so you’re British now?</h1>
          <p className="sub">Two weeks in London and suddenly it’s “wa’er.” Interesting. We listen. We judge. We might be wrong.</p>
          <div className="center">
            <Orb />
            <Wave />
          </div>
          <div className="foot">
            <button className="btn" type="button" onClick={() => setView('accent')}>Continue</button>
            <p className="fine">F.A.K.E. · For entertainment. Not a real accent test.</p>
          </div>
        </section>
      )}

      {view === 'accent' && (
        <section className="screen">
          <h1>Who are you doing?</h1>
          <p className="sub">Pick the accent under investigation.</p>
          <div className="list" role="radiogroup" aria-label="Accent under investigation">
            {ACCENTS.map((a) => (
              <button key={a.id} type="button" role="radio" className="opt" aria-checked={accent === a.id} onClick={() => setAccent(accent === a.id ? null : a.id)}>
                <span>{a.id === 'none' ? 'Just me. This is how I talk.' : a.label}</span>
                <span className="tick">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
                </span>
              </button>
            ))}
          </div>
          <div className="center" />
          <div className="foot">
            <button className="btn" type="button" onClick={() => setView('say')}>Continue</button>
          </div>
        </section>
      )}

      {view === 'say' && (
        <section className="screen">
          <h1>Say it out loud.</h1>
          <p className="sub">Tap the orb and talk, or type what you said. F.A.K.E. turns it into a case.</p>
          <div className="center">
            <Orb
              state={recording ? 'rec' : measuring ? 'busy' : undefined}
              done={!!audio && !recording}
              label={recording ? 'Stop recording' : 'Start recording'}
              onClick={() => (recording ? stopRecording() : measuring ? undefined : startRecording())}
            />
            <Wave levels={recording ? live : audio?.envelope} />
            {audio && !recording ? (
              <div className="filechip">
                <span>{audioName} · {audio.speechSec}s of speech</span>
                <button type="button" onClick={() => { clearClip(); say('Evidence destroyed. We saw nothing.'); }}>Remove</button>
              </div>
            ) : (
              <p className="cap" aria-live="polite">{orbCaption}</p>
            )}
            {!recording && !audio && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept="audio/*,video/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) takeClip(f, f.name);
                  }}
                />
                <button className="link" type="button" onClick={() => fileInput.current?.click()}>or upload a voice memo</button>
              </>
            )}
          </div>
          <textarea className="field" rows={2} placeholder="Or type what you said" value={said} onChange={(e) => setSaid(e.target.value)} aria-label="What you said" />
          <button className="try" type="button" onClick={() => { setSaid(TRY_LINE); setErr(null); }}>Try: “Cheers mate, can I get a bo’le of wa’er?”</button>
          {err && <p className="err">{err}</p>}
          <div className="foot">
            <button className="btn" type="button" onClick={submit} disabled={measuring}>Submit evidence</button>
            <p className="fine">Your voice stays on your phone. Only the measurements are sent.</p>
          </div>
        </section>
      )}

      {view === 'wait' && (
        <section className="screen">
          <h1>We’re all ears.</h1>
          <p className="sub">Unfortunately.</p>
          <div className="center">
            <Orb state="busy" />
            <Wave busy />
            <p className="cap" aria-live="polite">{STAGES[stage]}</p>
          </div>
        </section>
      )}

      {view === 'result' && report && (
        <section className="screen">
          <p className="tier">Report #{pad(report.no)} · Accent suspicion level</p>
          <div className="big">{report.score}<small>%</small></div>
          <p className="tier">{report.tier} · fictional score</p>
          <p className="head">{report.head}</p>
          <p className="sub">{report.sub}</p>
          <p className="obs">
            {report.observation.split(/(“[^”]+”)/).map((part, i) => (/^“[^”]+”$/.test(part) ? <mark key={i}>{part}</mark> : part))}
          </p>
          <dl className="rows">
            <div><dt>Suspected influence</dt><dd>{report.influence}</dd></div>
            <div><dt>Vowel drama</dt><dd>{report.drama}</dd></div>
            <div><dt>Evidence quality</dt><dd>{report.quality}</dd></div>
          </dl>
          <div className="verdict">
            <span className="k">{innocent ? 'Not guilty' : 'Found guilty'}</span>
            <span className="charge">{report.charge}</span>
            <span className="sentence">{report.sentence}</span>
          </div>
          <p className="by">{report.by}</p>
          <div className="foot">
            <button className="btn" type="button" onClick={copy}>Copy my allegations</button>
            {lastEvidence.current && (
              <button className="ghost" type="button" onClick={() => lastEvidence.current && investigate(lastEvidence.current)}>That wasn’t my real accent</button>
            )}
            <button className="ghost" type="button" onClick={newCase}>Start a new case</button>
            <button className="ghost" type="button" onClick={() => { setArmed(false); setView('history'); }}>Previous allegations</button>
          </div>
        </section>
      )}

      {view === 'history' && (
        <section className="screen">
          <h1>Previous allegations</h1>
          {history.length === 0 ? (
            <p className="sub">A clean record. For now.</p>
          ) : (
            <div className="list">
              {history.map((r) => (
                <button key={`${r.no}-${r.date}`} type="button" className="case" onClick={() => { setReport(r); setView('result'); }}>
                  <b>{r.score}%</b>
                  <span>
                    {r.head}
                    <small>#{pad(r.no)} · {r.persona === 'none' ? 'Not guilty' : 'Guilty'} {r.charge}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="center" />
          <div className="foot">
            <button className="btn" type="button" onClick={newCase}>Start a new case</button>
            {history.length > 0 && (
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  if (!armed) {
                    setArmed(true);
                    return;
                  }
                  setArmed(false);
                  store.set('history', []);
                  setHistory([]);
                  say('All evidence destroyed.');
                }}
              >
                {armed ? 'Tap again to shred everything' : 'Destroy the evidence'}
              </button>
            )}
          </div>
        </section>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
