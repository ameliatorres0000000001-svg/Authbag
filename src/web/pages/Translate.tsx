import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Page, errText } from '../ui.tsx';
import { MeContext } from '../App.tsx';
import MicButton from '../MicButton.tsx';

type L = 'km' | 'th' | 'ms' | 'id';
const LANGS: { k: L; name: string; sr: string }[] = [
  { k: 'km', name: 'ខ្មែរ', sr: 'km-KH' }, { k: 'th', name: 'ไทย', sr: 'th-TH' }, { k: 'ms', name: 'Bahasa Melayu', sr: 'ms-MY' }, { k: 'id', name: 'Bahasa Indonesia', sr: 'id-ID' },
];
const NAME: Record<string, string> = { km: 'ខ្មែរ', th: 'ไทย', ms: 'Bahasa Melayu', id: 'Bahasa Indonesia' };
const STAFF_ROLES = ['owner', 'lead_authenticator', 'appraiser'];

type SR = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null; start(): void; stop(): void };
const speechCtor = (): (new () => SR) | null => { const w = window as any; return w.SpeechRecognition || w.webkitSpeechRecognition || null; };

/** Looks and works like Google Translate: two language pickers with a swap button, one big input with a microphone, the result below. Nothing is stored. */
export default function TranslatePage() {
  const { t } = useI18n();
  const [from, setFrom] = useState<L | 'auto'>('auto');
  const [to, setTo] = useState<L>('km');
  const [text, setText] = useState('');
  const [check, setCheck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<{ from: string; text: string; back: string | null; to: L } | null>(null);
  const [copied, setCopied] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<L | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const srRef = useRef<SR | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { try { srRef.current?.stop(); } catch { /* already stopped */ } if (recRef.current?.state === 'recording') recRef.current.stop(); if (stopTimer.current) clearTimeout(stopTimer.current); }, []);

  const translate = async (src: string, fromLang: L | 'auto' = from, toLang: L = to) => {
    if (!src.trim()) return;
    setBusy(true); setErr(''); setRes(null); setCopied(false);
    try {
      const r = await api.post<{ from: string; text: string; back: string | null }>('/api/translate', { text: src, to: toLang, from: fromLang === 'auto' ? null : fromLang, check });
      setRes({ ...r, to: toLang });
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  const swap = () => {
    const f = from === 'auto' ? (res && res.from !== 'other' ? (res.from as L) : null) : from;
    if (!f) return;
    setFrom(to); setTo(f);
    if (res) { setText(res.text); setRes(null); }
  };

  const stopAll = () => {
    try { srRef.current?.stop(); } catch { /* already stopped */ }
    if (recRef.current?.state === 'recording') recRef.current.stop();
    if (stopTimer.current) { clearTimeout(stopTimer.current); stopTimer.current = null; }
  };

  // Microphone. A language picked in "From": the phone's own speech recognition (live words, free). "Detect": the recording goes to the server, which finds which of the four languages it is.
  const mic = async () => {
    setErr('');
    if (listening) { stopAll(); return; }
    const Ctor = speechCtor();
    if (from !== 'auto' && Ctor) {
      const sr = new Ctor();
      sr.lang = LANGS.find((l) => l.k === from)!.sr; sr.continuous = true; sr.interimResults = true;
      let finalText = text.trim() ? text.trim() + ' ' : '';
      sr.onresult = (e: any) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript; }
        setText((finalText + interim).slice(0, 3000));
      };
      sr.onerror = (e: any) => { if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') setErr(t('tr.micDenied')); else if (e?.error && e.error !== 'no-speech' && e.error !== 'aborted') { setErr(t('tr.micFallback')); } };
      sr.onend = () => { setListening(false); srRef.current = null; const out = finalText.trim(); if (out) { setText(out); translate(out); } };
      srRef.current = sr; setListening(true);
      try { sr.start(); } catch { setListening(false); }
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setErr(t('tr.micNo')); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { setErr(t('tr.micDenied')); return; }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = async () => {
      stream.getTracks().forEach((x) => x.stop());
      setListening(false);
      const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
      if (blob.size < 1500) { setErr(t('tr.micShort')); return; }
      setBusy(true);
      try {
        const fd = new FormData(); fd.append('audio', blob, 'voice'); if (from !== 'auto') fd.append('from', from);
        const v = await api.post<{ lang: L; text: string }>('/api/translate/voice', fd);
        setHeard(v.lang); setText(v.text.slice(0, 3000));
        await translate(v.text, v.lang);
      } catch (e) {
        const code = (e as { body?: { error?: string } }).body?.error;
        setErr(code === 'audio_needs_gemini' ? t('tr.micNeedsGemini') : code === 'audio_unclear' ? t('tr.micUnclear') : errText(e));
        setBusy(false);
      }
    };
    recRef.current = r; r.start(); setListening(true);
    stopTimer.current = setTimeout(() => { if (r.state === 'recording') r.stop(); }, 60000);
  };

  const copy = async () => { try { await navigator.clipboard.writeText(res?.text ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard not allowed */ } };
  const clear = () => { stopAll(); setText(''); setRes(null); setErr(''); setHeard(null); };
  const sel = 'min-w-0 flex-1 rounded-full border border-hairline bg-surface-card px-3 py-2.5 text-sm font-medium';
  const shownFrom = from === 'auto' && heard ? `${t('tr.auto')} · ${NAME[heard]}` : null;

  return (
    <Page title={t('tr.title')} subtitle={t('tr.sub')}>
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="flex items-center gap-2">
          <select className={sel} value={from} onChange={(e) => { setFrom(e.target.value as L | 'auto'); setHeard(null); }} aria-label={t('tr.from')}>
            <option value="auto">{t('tr.auto')}</option>
            {LANGS.map((l) => <option key={l.k} value={l.k}>{l.name}</option>)}
          </select>
          <button type="button" onClick={swap} disabled={from === 'auto' && !(res && res.from !== 'other')} aria-label={t('tr.swap')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hairline text-lg disabled:opacity-40">⇄</button>
          <select className={sel} value={to} onChange={(e) => { const v = e.target.value as L; setTo(v); if (text.trim()) translate(text, from, v); }} aria-label={t('tr.to')}>
            {LANGS.map((l) => <option key={l.k} value={l.k}>{l.name}</option>)}
          </select>
        </div>

        <div className="rounded-2xl border border-hairline bg-surface-card p-3">
          {shownFrom && <div className="mb-1 text-xs text-muted">{shownFrom}</div>}
          <div className="flex items-start gap-2">
            <textarea className="min-h-[7rem] w-full resize-none border-0 bg-transparent p-1 text-lg outline-none" maxLength={3000} value={text}
              onChange={(e) => setText(e.target.value)} placeholder={listening ? t('tr.listening') : t('tr.placeholder')} aria-label={t('tr.from')} />
            {text && <button type="button" onClick={clear} className="shrink-0 rounded-full p-2 text-muted" aria-label={t('tr.clear')}>✕</button>}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <MicButton listening={listening} disabled={busy && !listening} onClick={mic} label={listening ? t('tr.micStop') : t('tr.mic')} size={60} />
            <span className="min-w-0 flex-1 truncate text-center text-xs text-muted">{listening ? t('tr.listening') : `${text.length}/3000`}</span>
          </div>
        </div>

        <button type="button" className="btn bg-gold text-charcoal w-full py-3.5 text-base font-semibold" disabled={busy || listening || !text.trim()} onClick={() => translate(text)}>
          {busy ? '…' : `🌐 ${t('tr.go')}`}
        </button>

        {err && <p className="text-sm text-counterfeit" role="alert">{err}</p>}

        {res && (
          <div className="space-y-3 rounded-2xl border border-gold/40 bg-gold/10 p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              <span>{NAME[res.to]}</span>
              <button type="button" className="rounded-full border border-hairline px-3 py-1" onClick={copy}>{copied ? `✓ ${t('tr.copied')}` : `⧉ ${t('tr.copy')}`}</button>
            </div>
            <p className="whitespace-pre-wrap break-words text-xl leading-relaxed" lang={res.to}>{res.text}</p>
            {res.back && (
              <div className="border-t border-hairline pt-3">
                <div className="mb-1 text-xs text-muted">{t('tr.back')} ({NAME[res.from] ?? ''})</div>
                <p className="whitespace-pre-wrap break-words text-sm text-muted" lang={res.from}>{res.back}</p>
              </div>
            )}
          </div>
        )}

        <label className="flex items-start gap-2 px-1 text-sm">
          <input type="checkbox" className="mt-1" checked={check} onChange={(e) => setCheck(e.target.checked)} />
          <span>{t('tr.check')}<span className="block text-xs text-muted">{t('tr.checkHint')}</span></span>
        </label>
        <p className="px-1 text-[11px] text-muted">{t('tr.note')}</p>
      </div>
    </Page>
  );
}

/** Home shortcut (staff only). */
export function TranslateHome() {
  const { t } = useI18n();
  const me = useContext(MeContext);
  if (!me || !STAFF_ROLES.includes(me.role)) return null;
  return (
    <Link to="/translate" className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-card p-3.5 hover:border-gold">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-xl" aria-hidden>🌐</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{t('tr.homeTitle')}</span>
        <span className="block text-xs text-muted">{t('tr.homeSub')}</span>
      </span>
      <span className="text-muted" aria-hidden>›</span>
    </Link>
  );
}
