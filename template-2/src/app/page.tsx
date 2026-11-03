'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ACCENTS, PERSONAS, PHRASES, STAGES, type AccentId } from '@/lib/fake/data';
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
import { measureAudio } from '@/lib/fake/audio';

type View = 'boot' | 'welcome' | 'home' | 'analyzing' | 'report' | 'error' | 'history' | 'settings';
interface Settings {
  claude: boolean;
  gentle: boolean;
}

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
const STAGE_MS = 700;

export default function Home() {
  const [view, setView] = useState<View>('boot');
  const [accent, setAccent] = useState<AccentId | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [said, setSaid] = useState('');
  const [warn, setWarn] = useState<string | null>(null);
  const [bagging, setBagging] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [freshStamp, setFreshStamp] = useState(false);
  const [history, setHistory] = useState<Report[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [settings, setSettings] = useState<Settings>({ claude: true, gentle: false });
  const [caseNo, setCaseNo] = useState(42);
  const [toast, setToast] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInput = useRef<HTMLInputElement>(null);
  const lastEvidence = useRef<Evidence | null>(null);
  const stagesDone = useRef<(() => void) | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setSettings(store.get('settings', { claude: true, gentle: false }));
    setHistory(store.get<Report[]>('history', []));
    setCaseNo(store.get('caseNo', 42));
    setView(store.get('welcomed', false) ? 'home' : 'welcome');
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  const say = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  function updateSettings(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    store.set('settings', next);
  }

  // ---------- analyzing stages ----------
  const advance = useCallback(() => {
    setStage((s) => {
      if (s >= STAGES.length - 1) {
        stagesDone.current?.();
        stagesDone.current = null;
        return s;
      }
      return s + 1;
    });
  }, []);

  useEffect(() => {
    if (view !== 'analyzing') return;
    const t = setInterval(advance, STAGE_MS);
    return () => clearInterval(t);
  }, [view, advance]);

  async function investigate(ev: Evidence) {
    setStage(0);
    setView('analyzing');
    const minimum = new Promise<void>((resolve) => {
      stagesDone.current = resolve;
    });
    try {
      const j = judge(ev);
      const p = PERSONAS[j.persona];
      let allegations: Allegations = clerkAllegations(ev, j);
      let by = 'Written by the in-house clerk';
      if (settings.claude) {
        try {
          const res = await fetch('/api/allegations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accent: ev.accent,
              said: ev.said,
              gentle: settings.gentle,
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
            by = 'Allegations written by Claude, acting well outside its qualifications';
          } else {
            by = `Written by the in-house clerk (${String(data.error || 'Claude was unavailable').replace(/\.$/, '')})`;
          }
        } catch {
          by = 'Written by the in-house clerk (Claude is on a coffee break)';
        }
      }
      await minimum;
      const r: Report = {
        ...allegations,
        no: caseNo,
        date: new Date().toISOString().slice(0, 10),
        score: j.score,
        tier: j.tier,
        persona: j.persona,
        head: p.head,
        sub: p.sub,
        by,
        exhibits: exhibitsFor(ev),
      };
      const nextHistory = [r, ...history].slice(0, 30);
      setHistory(nextHistory);
      store.set('history', nextHistory);
      setCaseNo(caseNo + 1);
      store.set('caseNo', caseNo + 1);
      showReport(r, true);
    } catch {
      setErrorMsg('Something went wrong while reviewing the evidence. Try a different file, or just type what you said.');
      setView('error');
    }
  }

  function showReport(r: Report, fresh: boolean) {
    setReport(r);
    setFreshStamp(fresh);
    setView('report');
  }

  // ---------- intake ----------
  function pickFile(f: File | null) {
    setFile(f);
    setWarn(null);
  }

  async function submit() {
    const text = said.trim();
    if (!file && !text) return setWarn('No evidence submitted. Upload a voice memo or type what you said.');
    setWarn(null);
    let audio: Evidence['audio'] = null;
    if (file) {
      setBagging(true);
      try {
        const m = await measureAudio(file);
        if (m.peak < 0.01 || m.speechSec < 0.4) {
          if (!text) return setWarn('The silence sounds suspiciously authentic. We heard nothing in that file.');
        } else if (m.speechSec < 1.5 && !text) {
          return setWarn('Three syllables? We’re detectives, not magicians. Give us at least a few seconds.');
        } else {
          audio = m;
        }
      } catch {
        return setWarn('We couldn’t open that file. Try an MP3, M4A or WAV voice memo.');
      } finally {
        setBagging(false);
      }
    }
    const facts = countMarkers(text);
    if (!audio && facts.words < 3) return setWarn('Three syllables? We’re detectives, not magicians. Type at least a full sentence.');
    const ev: Evidence = { accent, said: text, audio, text: facts };
    lastEvidence.current = ev;
    investigate(ev);
  }

  async function copy(text: string, ok: string) {
    try {
      await navigator.clipboard.writeText(text);
      say(ok);
    } catch {
      say('Copy refused. Select the text manually.');
    }
  }

  const goHome = () => setView('home');
  const welcomed = () => {
    store.set('welcomed', true);
    goHome();
  };

  const innocent = report?.persona === 'none';

  return (
    <div className="wrap">
      <header className="bar">
        <button className="logo" type="button" aria-label="F.A.K.E. home" onClick={goHome}>
          <span className="mark" aria-hidden="true">
            {'FAKE'.split('').map((l) => (
              <span key={l} className="ink">
                {l}
              </span>
            ))}
          </span>
          <small>Foreign Accent Knowledge Examiner</small>
        </button>
        <nav className="nav">
          <button className="link" type="button" onClick={() => { setConfirmClear(false); setView('history'); }}>
            Previous allegations
          </button>
          <button className="link" type="button" onClick={() => setView('settings')}>
            Manage your paranoia
          </button>
        </nav>
      </header>

      {view === 'welcome' && (
        <section className="screen">
          <div className="kicker">
            <span>01 / Welcome</span>
            <span>Questioning accents. Not identities.</span>
          </div>
          <div className="hero">
            <h1>Oh, so you’re British now?</h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/fake-hero.webp" alt="Illustration from below: a giant yellow sneaker sole and an enormous orange hand reaching toward you" />
            <p className="bubble ink">
              <span>Two weeks in London and suddenly it’s “wa’er” instead of “water.”</span>
              <span className="mono">Interesting.</span>
            </p>
          </div>
          <div className="terms">
            <p><b>We listen. We judge. We might be wrong.</b></p>
            <p className="small">For entertainment. Not an actual accent authenticity test.</p>
          </div>
          <div className="row">
            <button className="btn" type="button" onClick={welcomed}>Open my case file</button>
          </div>
          <button className="textbtn" type="button" onClick={() => { welcomed(); say('Dignity check skipped. Bold.'); }}>
            Skip the dignity check
          </button>
        </section>
      )}

      {view === 'home' && (
        <section className="screen">
          <div className="kicker">
            <span>Case intake</span>
            <span>Case #{pad(caseNo)}</span>
          </div>
          <div>
            <h2>Talk normally.</h2>
            <p className="mono" style={{ marginTop: 8 }}>Whatever that means.</p>
          </div>
          <p>Submit a voice memo, type what you said, or both. Our extremely nosy algorithm will take it from there.</p>

          <div className="slip s ink">
            <span className="label" id="lbl-accent">Accent under investigation</span>
            <div className="chips" role="group" aria-labelledby="lbl-accent">
              {ACCENTS.map((a) => (
                <button key={a.id} type="button" className="chip" aria-pressed={accent === a.id} onClick={() => setAccent(accent === a.id ? null : a.id)}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="slip o ink">
            <span className="label">Exhibit A · voice memo</span>
            <input ref={fileInput} type="file" accept="audio/*,video/*" hidden onChange={(e) => { pickFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
            {file ? (
              <div className="filecard">
                <span className="mono">Exhibit A: {file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)</span>
                <button className="textbtn" type="button" onClick={() => { pickFile(null); say('Evidence destroyed. We saw nothing.'); }}>
                  Destroy the evidence
                </button>
              </div>
            ) : (
              <button
                className={`drop${dragOver ? ' over' : ''}`}
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) pickFile(f); }}
              >
                <span className="disc" aria-hidden="true">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                </span>
                <span>
                  <b>Upload to incriminate yourself</b>
                  <span className="small">Record a voice memo on your phone, then drop it here. The vowels are collected as evidence.</span>
                </span>
              </button>
            )}
          </div>

          <div className="slip y ink">
            <label className="label" htmlFor="said">Exhibit B · what you said</label>
            <textarea id="said" value={said} onChange={(e) => setSaid(e.target.value)} placeholder="Speak your truth. Or whatever version you’re using today." />
            <span className="label">Suggested phrases</span>
            <div className="phrases">
              {PHRASES.map((p) => (
                <button key={p} type="button" className="phrase" onClick={() => setSaid((s) => (s.trim() ? s.trim() + ' ' : '') + p)}>
                  “{p}”
                </button>
              ))}
            </div>
          </div>

          {warn && <p className="warn">{warn}</p>}
          <div className="row">
            <button className="btn" type="button" disabled={bagging} onClick={submit}>
              {bagging ? 'Bagging the evidence…' : 'Submit evidence'}
            </button>
          </div>
          <p className="small">Anything you say can and will be overanalyzed. No accents were harmed in the making of this app.</p>
        </section>
      )}

      {view === 'analyzing' && (
        <section className="screen">
          <div className="kicker">
            <span>Case under review</span>
            <span>Please hold still</span>
          </div>
          <h2>We’re all ears. Unfortunately.</h2>
          <div className="reach" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/fake-hero.webp" alt="" />
            <span className="stage">Stage {stage + 1} of {STAGES.length}</span>
          </div>
          <div className="scan" aria-hidden="true">
            <i style={{ width: `${Math.round(((stage + 1) / STAGES.length) * 100)}%` }} />
          </div>
          <p className="ticker" aria-live="polite">{STAGES[stage]}</p>
          <div className="log">
            {STAGES.slice(0, stage).map((s) => (
              <div key={s}><s>{s}</s> ✓</div>
            ))}
          </div>
          <button className="textbtn" type="button" onClick={advance}>Next investigation stage</button>
        </section>
      )}

      {view === 'report' && report && (
        <section className="screen">
          <div className="kicker">
            <span>Confidentially ridiculous report #{pad(report.no)}</span>
            <span>Filed {report.date}</span>
          </div>
          <div>
            <span className="label">Accent suspicion level</span>
            <div className="score">
              <span className="pct">{report.score}%</span>
              <div>
                <div className="tier">{report.tier}</div>
                <div className="small">Fictional score. Scientifically unserious.</div>
              </div>
            </div>
          </div>
          <div className="verdict-head">
            <h2>{report.head}</h2>
            <p>{report.sub}</p>
          </div>
          <p className="obs">
            {report.observation.split(/(“[^”]+”)/).map((part, i) => (/^“[^”]+”$/.test(part) ? <mark key={i}>{part}</mark> : part))}
          </p>
          <dl className="facts">
            <div className="ink"><dt>Suspected influence</dt><dd>{report.influence}</dd></div>
            <div className="ink"><dt>Vowel drama</dt><dd>{report.drama}</dd></div>
            <div className="ink"><dt>Evidence quality</dt><dd>{report.quality}</dd></div>
          </dl>
          {report.exhibits.length > 0 && (
            <dl className="exhibits">
              {report.exhibits.map(([k, v], i) => (
                <div key={k} className="exhibit">
                  <dt>Exhibit {String.fromCharCode(65 + i)} · {k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="byline">{report.by}.</p>

          <div className="card ink">
            <span className={`stamp${freshStamp ? ' pop' : ''}`}>{innocent ? 'Case dismissed' : '100% unqualified opinion'}</span>
            <span className="div"><b>F.A.K.E.</b> · Accent Crimes Division</span>
            <span className="guilty">{innocent ? 'Not guilty' : 'Found guilty'}</span>
            <span className="charge">{report.charge}</span>
            <span className="sentence">{report.sentence}</span>
          </div>

          <div className="row">
            <button className="btn" type="button" onClick={() => copy(allegationText(report), 'Allegations copied. Use responsibly.')}>Copy my allegations</button>
            <button
              className="btn alt"
              type="button"
              onClick={() => copy(`F.A.K.E. Accent Crimes Division: ${innocent ? 'NOT GUILTY' : 'FOUND GUILTY'} ${report.charge} ${report.sentence} Suspicion level ${report.score}%. 100% unqualified opinion.`, 'Copied. You are now exposed.')}
            >
              Expose myself
            </button>
          </div>
          <div className="row">
            <button className="btn alt" type="button" disabled={!lastEvidence.current} onClick={() => lastEvidence.current && investigate(lastEvidence.current)}>
              That wasn’t my real accent
            </button>
            <button className="btn alt" type="button" onClick={() => { pickFile(null); setSaid(''); goHome(); }}>I’d like a lawyer</button>
          </div>
        </section>
      )}

      {view === 'error' && (
        <section className="screen">
          <div className="kicker"><span>Case suspended</span></div>
          <h2>Our detective has lost the plot.</h2>
          <p>{errorMsg}</p>
          <div className="row"><button className="btn" type="button" onClick={goHome}>Back to case intake</button></div>
        </section>
      )}

      {view === 'history' && (
        <section className="screen">
          <div className="kicker">
            <span>Records office</span>
            <span>{history.length ? `${history.length} on file` : ''}</span>
          </div>
          <h2>Previous allegations</h2>
          {history.length === 0 ? (
            <p className="clean">A clean record. For now.</p>
          ) : (
            <div className="hist">
              {history.map((r) => (
                <button key={`${r.no}-${r.date}`} type="button" className="case" onClick={() => showReport(r, false)}>
                  <span className="n">{r.score}%</span>
                  <span className="t">
                    <b>{r.head}</b>
                    <span className="small">#{pad(r.no)} · {r.persona === 'none' ? 'Not guilty' : 'Guilty'} {r.charge}</span>
                  </span>
                  <span className="small">{r.date}</span>
                </button>
              ))}
            </div>
          )}
          {history.length > 0 && !confirmClear && (
            <button className="textbtn" type="button" onClick={() => setConfirmClear(true)}>Destroy all evidence</button>
          )}
          {confirmClear && (
            <div className="row">
              <button className="btn" type="button" onClick={() => { setHistory([]); store.set('history', []); setConfirmClear(false); say('All evidence destroyed. We were never here.'); }}>
                Yes, shred everything
              </button>
              <button className="btn alt" type="button" onClick={() => setConfirmClear(false)}>Keep my record</button>
            </div>
          )}
        </section>
      )}

      {view === 'settings' && (
        <section className="screen">
          <div className="kicker"><span>Form P-4</span></div>
          <h2>Manage your paranoia</h2>
          <div className="slip g ink">
            <label className="toggle" htmlFor="set-claude">
              <input id="set-claude" type="checkbox" checked={settings.claude} onChange={(e) => updateSettings({ claude: e.target.checked })} />
              <span>
                <b>Allow us to be nosy?</b>
                <br />
                <span className="small" style={{ color: 'var(--ink)' }}>Claude reads your measurements and words, then writes the allegations. Turn it off and our in-house clerk writes them from a filing cabinet of templates.</span>
              </span>
            </label>
          </div>
          <div className="slip y ink">
            <label className="toggle" htmlFor="set-gentle">
              <input id="set-gentle" type="checkbox" checked={settings.gentle} onChange={(e) => updateSettings({ gentle: e.target.checked })} />
              <span>
                <b>Plead for leniency</b>
                <br />
                <span className="small" style={{ color: 'var(--ink)' }}>Allegations get slightly less judgmental. Slightly.</span>
              </span>
            </label>
          </div>
          <p className="small">How the score works: words like “cheers” and “mate”, glottal apostrophes (“wa’er”), how far your pitch travels, how fast you talk, and whether you admitted to attempting an accent. It is made up. That’s the point.</p>
          <div className="row"><button className="btn" type="button" onClick={goHome}>Back to case intake</button></div>
        </section>
      )}

      <footer>F.A.K.E. <span>·</span> We don’t believe a word you accent.</footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
