import React, { useRef, useState } from 'react';

// Web NFC (Chrome on Android, HTTPS only). Reads a tag's UID / NDEF presence.
// A readable tag proves nothing about authenticity; we only record "detected_readable".
// Absence/failure is never auto-recorded as a negative — the appraiser chooses that.
type Props = { locale: string; disabled?: boolean; onRead: (info: { serial: string }) => void };

export default function NfcRead({ locale, disabled, onRead }: Props) {
  const km = locale === 'km';
  const [state, setState] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const abort = useRef<AbortController | null>(null);
  const supported = typeof window !== 'undefined' && 'NDEFReader' in window;

  if (!supported) {
    return <p className="text-xs text-muted">{km ? 'ឧបករណ៍/កម្មវិធីរុករកនេះមិនគាំទ្រ Web NFC ទេ (ត្រូវការ Chrome លើ Android)។ សូមជ្រើសលទ្ធផលដោយដៃខាងស្តាំ។' : 'Web NFC is not supported here (needs Chrome on Android). Record the result by hand on the right.'}</p>;
  }

  const start = async () => {
    setMsg(''); setState('scanning');
    try {
      const ctrl = new AbortController(); abort.current = ctrl;
      const reader = new (window as any).NDEFReader();
      await reader.scan({ signal: ctrl.signal });
      const timer = setTimeout(() => { ctrl.abort(); setState('error'); setMsg(km ? 'មិនអានបានក្នុង 15 វិនាទី។ នេះមិនមានន័យថាគ្មានឈីបទេ។' : 'Nothing read in 15 s. This does not mean there is no chip.'); }, 15000);
      reader.onreading = (ev: any) => {
        clearTimeout(timer); ctrl.abort();
        setState('done'); setMsg(`UID: ${ev.serialNumber || '—'}`);
        onRead({ serial: ev.serialNumber || '' });
      };
      reader.onreadingerror = () => { clearTimeout(timer); setState('error'); setMsg(km ? 'ឃើញ tag ប៉ុន្តែអានមិនបាន។' : 'Tag seen but unreadable.'); };
    } catch (e: any) {
      setState('error'); setMsg(e?.message || String(e));
    }
  };

  return (
    <div className="space-y-2">
      <button type="button" className="btn" disabled={disabled || state === 'scanning'} onClick={start}>
        {state === 'scanning' ? (km ? 'កំពុងស្កេន… ដាក់ទូរស័ព្ទជិតកាបូប' : 'Scanning… hold phone near the bag') : (km ? 'អាន NFC' : 'Read NFC')}
      </button>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
