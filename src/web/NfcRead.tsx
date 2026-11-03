import React, { useRef, useState } from 'react';
import { useI18n } from './i18n.tsx';

// Web NFC (Chrome on Android, HTTPS only). Reads a tag's UID and any public NDEF records.
// A readable tag proves nothing about authenticity; brands verify their own chips.
// Absence/failure is never auto-recorded as a negative — the appraiser chooses that.
export interface NfcRecord { type: string; mediaType?: string; text?: string; url?: string; bytes: number }
export interface NfcInfo { serial: string; records: NfcRecord[] }

type Props = { locale?: string; disabled?: boolean; onRead: (info: NfcInfo) => void; big?: boolean };

export const nfcSupported = () => typeof window !== 'undefined' && 'NDEFReader' in window;

function decodeRecord(r: any): NfcRecord {
  const bytes = r.data?.byteLength ?? 0;
  const out: NfcRecord = { type: String(r.recordType ?? 'unknown'), mediaType: r.mediaType || undefined, bytes };
  try {
    if (r.recordType === 'text') out.text = new TextDecoder(r.encoding || 'utf-8').decode(r.data);
    else if (r.recordType === 'url' || r.recordType === 'absolute-url') out.url = new TextDecoder().decode(r.data);
    else if (r.mediaType?.startsWith('text/') || r.mediaType === 'application/json') out.text = new TextDecoder().decode(r.data).slice(0, 500);
  } catch { /* keep type and size only */ }
  return out;
}

export default function NfcRead({ disabled, onRead, big }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const abort = useRef<AbortController | null>(null);

  if (!nfcSupported()) return <p className="text-xs text-muted">{t('nfc.unsupported')}</p>;

  const start = async () => {
    setMsg(''); setState('scanning');
    try {
      abort.current?.abort();
      const ctrl = new AbortController(); abort.current = ctrl;
      const reader = new (window as any).NDEFReader();
      await reader.scan({ signal: ctrl.signal });
      const timer = setTimeout(() => { ctrl.abort(); setState('error'); setMsg(t('nfc.timeout')); }, 15000);
      reader.onreading = (ev: any) => {
        clearTimeout(timer); ctrl.abort();
        const records: NfcRecord[] = (ev.message?.records ?? []).map(decodeRecord);
        setState('done'); setMsg(`UID: ${ev.serialNumber || '—'}`);
        onRead({ serial: ev.serialNumber || '', records });
      };
      reader.onreadingerror = () => { clearTimeout(timer); setState('error'); setMsg(t('nfc.unreadable')); };
    } catch (e: any) {
      setState('error'); setMsg(e?.message || String(e));
    }
  };

  return (
    <div className="space-y-2">
      <button type="button" className={big ? 'btn-primary w-full !py-4 text-base' : 'btn'} disabled={disabled || state === 'scanning'} onClick={start}>
        {state === 'scanning' ? t('nfc.scanning') : t('nfc.read')}
      </button>
      {state === 'scanning' && big && (
        <div className="flex justify-center py-2" aria-hidden>
          <span className="relative flex h-16 w-16"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-40" /><span className="relative inline-flex h-16 w-16 rounded-full bg-gold/70" /></span>
        </div>
      )}
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
