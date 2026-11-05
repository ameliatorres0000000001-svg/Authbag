import React, { useEffect, useState } from 'react';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';

export interface Contact { lineId: string | null; phone: string | null; telegram: string | null; note: string | null; qr: boolean; qrVersion: string | null }

/** HENGZ contact for customers: QR code (e.g. LINE add-friend), LINE ID, phone. Nothing shows until an admin fills it in. */
export default function ContactInfo({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  const [c, setC] = useState<Contact | null>(null);
  useEffect(() => { api.get<Contact>('/api/contact').then(setC).catch(() => setC(null)); }, []);
  if (!c || (!c.qr && !c.lineId && !c.phone && !c.telegram)) return null;
  // LINE add-friend link: official accounts start with @, personal IDs use ~
  const line = c.lineId ? `https://line.me/R/ti/p/${c.lineId.startsWith('@') ? `@${encodeURIComponent(c.lineId.slice(1))}` : `~${encodeURIComponent(c.lineId)}`}` : null;
  return (
    <section className={`flex gap-4 rounded-2xl border border-hairline bg-surface-card ${compact ? 'p-3' : 'p-4'}`}>
      {c.qr && <img src={`/api/contact/qr?v=${c.qrVersion ?? ''}`} alt="QR" className={`${compact ? 'h-24 w-24' : 'h-32 w-32'} shrink-0 rounded-lg border border-hairline bg-white object-contain p-1`} />}
      <div className="min-w-0 space-y-1.5 text-sm">
        <div className="font-serif text-lg leading-tight">{t('contact.title')}</div>
        {c.note && <p className="text-xs text-muted">{c.note}</p>}
        {c.lineId && <a href={line!} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-semibold" style={{ color: '#06C755' }}>LINE · {c.lineId}</a>}
        {c.phone && <a href={`tel:${c.phone.replace(/[^+\d]/g, '')}`} className="block">📞 {c.phone}</a>}
        {c.telegram && <a href={`https://t.me/${c.telegram.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="block">✈️ {c.telegram}</a>}
      </div>
    </section>
  );
}
