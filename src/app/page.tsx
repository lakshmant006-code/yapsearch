'use client';

import { useEffect, useRef, useState } from 'react';
import { LANGS, LISTEN_LINES, houseRule, pick, type Hearing, type LangId } from '@/lib/fake/accents';
import { LLAMA_SVG } from '@/lib/fake/llama';
import { measureAudio } from '@/lib/fake/audio';
import { playSfx, type SfxName } from '@/lib/fake/sfx';

type Stage = 'idle' | 'listen' | 'think' | 'ok' | 'fake';
const MAX_LISTEN_MS = 8000;

// Minimal typing for the browser's speech recognition (not in TS's DOM lib).
interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string; confidence: number } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecCtor = new () => SpeechRec;

const MicIcon = ({ size }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

export default function Home() {
  const [disclaimer, setDisclaimer] = useState(true);
  const [lang, setLang] = useState<LangId>('en');
  const [phrase, setPhrase] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [bubble, setBubble] = useState('');
  const [verdict, setVerdict] = useState<{ ok: boolean; line: string } | null>(null);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [stampKey, setStampKey] = useState(0);

  const llamaRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const session = useRef<{
    stream: MediaStream;
    rec: MediaRecorder;
    chunks: Blob[];
    speech: SpeechRec | null;
    heard: { text: string; conf: number }[];
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const mutedRef = useRef(false);

  useEffect(() => {
    try {
      const m = localStorage.getItem('fake:muted') === '1';
      setMuted(m);
      mutedRef.current = m;
    } catch {}
  }, []);

  // The llama keeps an eye on you while it waits.
  useEffect(() => {
    if (stage !== 'idle') return;
    const move = (e: PointerEvent) => {
      const box = llamaRef.current?.getBoundingClientRect();
      if (!box) return;
      const dx = (e.clientX - (box.left + box.width / 2)) / box.width;
      const dy = (e.clientY - (box.top + box.height * 0.38)) / box.height;
      llamaRef.current?.querySelectorAll<SVGElement>('.l-pupil').forEach((p) => {
        p.style.transform = `translate(${Math.max(-4, Math.min(4, dx * 10))}px, ${Math.max(-3, Math.min(3, dy * 8))}px)`;
      });
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [stage]);

  useEffect(
    () => () => {
      void stopSession(true);
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const play = (n: SfxName) => {
    if (!mutedRef.current) playSfx(n);
  };
  const say = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  // ---------- listening ----------
  async function startListening() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      say('The llama needs your mic. Allow it in your browser settings.');
      return;
    }
    play('listen');
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start();

    const Ctor = (window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecCtor }).webkitSpeechRecognition;
    const heard: { text: string; conf: number }[] = [];
    let speech: SpeechRec | null = null;
    if (Ctor) {
      try {
        speech = new Ctor();
        speech.lang = LANGS[lang].speechLang;
        speech.continuous = true;
        speech.interimResults = false;
        speech.maxAlternatives = 1;
        speech.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) heard.push({ text: r[0].transcript, conf: r[0].confidence });
          }
        };
        speech.onerror = () => {};
        speech.start();
      } catch {
        speech = null;
      }
    }

    session.current = { stream, rec, chunks, speech, heard, timer: setTimeout(finishListening, MAX_LISTEN_MS) };
    setBubble(pick(LISTEN_LINES));
    setVerdict(null);
    setStage('listen');
  }

  function stopSession(discard = false): Promise<Blob | null> {
    const s = session.current;
    if (!s) return Promise.resolve(null);
    session.current = null;
    clearTimeout(s.timer);
    const blobReady = new Promise<Blob | null>((resolve) => {
      if (discard || s.rec.state === 'inactive') return resolve(null);
      s.rec.onstop = () => resolve(new Blob(s.chunks, { type: s.rec.mimeType || 'audio/webm' }));
      s.rec.stop();
    });
    const speechDone = new Promise<void>((resolve) => {
      if (!s.speech) return resolve();
      s.speech.onend = () => resolve();
      try {
        s.speech.stop();
      } catch {
        resolve();
      }
      setTimeout(resolve, 1500); // don't wait forever for a slow recognizer
    });
    return Promise.all([blobReady, speechDone]).then(([blob]) => {
      s.stream.getTracks().forEach((t) => t.stop());
      return blob;
    });
  }

  async function finishListening() {
    const s = session.current;
    if (!s) return;
    const heard = s.heard;
    setStage('think');
    setBubble('Hmm. Hmmmm.');
    const blob = await stopSession();
    if (!blob) return setStage('idle');
    let m;
    try {
      m = await measureAudio(blob);
    } catch {
      say('The llama couldn’t make sense of that recording.');
      return setStage('idle');
    }
    if (m.peak < 0.01 || m.speechSec < 0.6) {
      say('The llama heard nothing. Suspiciously quiet.');
      return setStage('idle');
    }
    const confs = heard.map((h) => h.conf).filter((c) => c > 0);
    const hearing: Hearing = {
      lang,
      transcript: heard.map((h) => h.text).join(' ').trim(),
      confidence: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null,
      phrase,
      speechSec: m.speechSec,
      pitchRangeSemitones: m.pitchRangeSemitones,
      syllablesPerSec: m.syllablesPerSec,
      pauseRatio: m.pauseRatio,
    };
    const minimum = new Promise((r) => setTimeout(r, 900));
    let v: { ok: boolean; line: string };
    try {
      const res = await fetch('/api/verdict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hearing) });
      if (!res.ok) throw new Error();
      v = await res.json();
    } catch {
      const ok = houseRule(hearing);
      v = { ok, line: pick(ok ? LANGS[lang].ok : LANGS[lang].fake) };
    }
    await minimum;
    reveal(v);
  }

  function reveal(v: { ok: boolean; line: string }) {
    setVerdict(v);
    if (v.ok) {
      setStage('ok');
      play('ok');
    } else {
      setStage('fake');
      setStampKey((k) => k + 1);
      play('stamp');
      setTimeout(() => play('fake'), 150);
      setTimeout(() => play('spit'), 1300);
      setTimeout(() => {
        const el = appRef.current;
        if (!el) return;
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
      }, 180);
    }
  }

  function toggleMute() {
    const m = !muted;
    setMuted(m);
    mutedRef.current = m;
    try {
      localStorage.setItem('fake:muted', m ? '1' : '0');
    } catch {}
    if (!m) playSfx('pop');
  }

  const llamaState = stage === 'think' ? 'listen' : stage;

  return (
    <>
      <div className="app" ref={appRef}>
        <div className="top">
          <div className="langs" role="radiogroup" aria-label="Accent">
            {(Object.keys(LANGS) as LangId[]).map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                className="lang"
                aria-checked={lang === id}
                disabled={stage === 'listen' || stage === 'think'}
                onClick={() => {
                  setLang(id);
                  setPhrase(null);
                  setStage('idle');
                  play('pop');
                }}
              >
                {LANGS[id].label}
              </button>
            ))}
          </div>
          <button className="sound" type="button" aria-label={muted ? 'Turn sounds on' : 'Mute sounds'} onClick={toggleMute}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              {muted ? <path d="M23 9l-6 6M17 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />}
            </svg>
          </button>
        </div>

        <div className="stage">
          <div
            className="llama-wrap"
            ref={llamaRef}
            dangerouslySetInnerHTML={{ __html: LLAMA_SVG.replace('<svg class="llama"', `<svg data-state="${llamaState}" class="llama"`) }}
          />
          {(stage === 'listen' || stage === 'think') && <p className="bubble">{bubble}</p>}
          {stage === 'fake' && (
            <div className="stamps go" key={stampKey} aria-hidden="true">
              <span className="ink" style={{ left: '18%', top: '14%' }} />
              <span className="ink" style={{ left: '80%', top: '9%', width: 7, height: 7 }} />
              <span className="ink" style={{ left: '72%', top: '26%', width: 13, height: 13 }} />
              <span className="ink" style={{ left: '26%', top: '30%', width: 6, height: 6 }} />
              <span className="stamp main">FAKE!</span>
              <span className="stamp mini m1">NOPE</span>
              <span className="stamp mini m2">BUSTED</span>
              <span className="stamp mini m3">SUS</span>
              <span className="stamp mini m4">DENIED</span>
            </div>
          )}
        </div>

        <div className="controls">
          {(stage === 'idle' || stage === 'listen' || stage === 'think') && (
            <>
              <button
                type="button"
                className={`mic${stage !== 'idle' ? ' on' : ''}`}
                aria-label={stage === 'idle' ? 'Tap to speak' : 'Stop listening'}
                disabled={stage === 'think'}
                onClick={() => (stage === 'idle' ? startListening() : finishListening())}
              >
                <MicIcon />
              </button>
              <p className="cap" aria-live="polite">{stage === 'idle' ? 'Tap to speak' : stage === 'listen' ? 'Listening…' : 'Judging…'}</p>
            </>
          )}
          {(stage === 'ok' || stage === 'fake') && verdict && (
            <div className={`verdict ${verdict.ok ? 'ok' : 'no'}`}>
              <div className="badge">
                {verdict.ok ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                )}
              </div>
              <p className="title">
                {verdict.ok ? 'Accent OK' : 'Accent Not OK'}
                <svg viewBox="0 0 200 14" preserveAspectRatio="none">
                  <path d="M4 9 Q60 2 110 7 T196 6" fill="none" stroke={verdict.ok ? 'var(--yellow)' : 'var(--red)'} strokeWidth="5" strokeLinecap="round" />
                </svg>
              </p>
              <p className="roast">{verdict.line}</p>
              <button className="again" type="button" onClick={() => { play('pop'); setStage('idle'); }}>
                <MicIcon size={18} />
                Try again
              </button>
            </div>
          )}
        </div>

        <div className="phrases">
          <span className="lbl">Try saying</span>
          <div className="chips">
            {LANGS[lang].phrases.map((p) => (
              <button key={p} type="button" className="chip" aria-pressed={phrase === p} onClick={() => { setPhrase(phrase === p ? null : p); play('pop'); }}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <p className="note">Or just talk to the llama. Your browser’s speech recognition hears you; only the words and a few measurements reach the llama.</p>
      </div>

      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id="rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="5" />
        </filter>
      </svg>

      {disclaimer && (
        <div className="sheet-bg" role="dialog" aria-modal="true" aria-labelledby="d-title">
          <div className="sheet">
            <h2 id="d-title">Just for fun</h2>
            <p>This llama is not a linguist. It roasts put-on accents for laughs and is often wrong. Every real accent is a good accent.</p>
            <button className="go-btn" type="button" onClick={() => { setDisclaimer(false); play('pop'); }}>Got it, judge me</button>
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
