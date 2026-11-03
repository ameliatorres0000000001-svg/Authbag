import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.tsx';
import NfcRead, { type NfcInfo } from '../NfcRead.tsx';

/** NFC lesson + reader: shows only what the phone can read (UID, public NDEF records) and what that means. */
export default function NfcCheck() {
  const { t } = useI18n();
  const [brand, setBrand] = useState<'lv' | 'chanel' | 'other'>('lv');
  const [info, setInfo] = useState<NfcInfo | null>(null);

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 pb-10 pt-5 md:px-8">
      <Link to="/check" className="font-mono text-[10px] uppercase tracking-widest text-muted">← {t('check.title')}</Link>
      <header>
        <h1 className="text-[28px] leading-tight">{t('nfc.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('nfc.subtitle')}</p>
      </header>

      <div className="inline-flex rounded-xl border border-hairline bg-surface-card p-0.5" role="tablist" aria-label={t('nfc.brand')}>
        {([['lv', 'Louis Vuitton'], ['chanel', 'Chanel'], ['other', '…']] as const).map(([k, name]) => (
          <button key={k} type="button" role="tab" aria-selected={brand === k} onClick={() => setBrand(k)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${brand === k ? 'bg-charcoal text-white' : ''}`}>{name}</button>
        ))}
      </div>

      <section className="space-y-3 rounded-2xl bg-charcoal p-5 text-white">
        <NfcRead big onRead={setInfo} />
        <p className="text-xs text-white/60">{t('nfc.how')}</p>
      </section>

      {info && (
        <section className="space-y-3 rounded-2xl border border-gold bg-surface-card p-4">
          <h2 className="text-xl">{t('nfc.result')}</h2>
          <div>
            <div className="label">{t('nfc.uid')}</div>
            <div className="break-all font-mono text-lg font-semibold">{info.serial || '—'}</div>
            <p className="text-xs text-muted">{t('nfc.uidHelp')}</p>
          </div>
          <div>
            <div className="label">{t('nfc.records')}</div>
            {info.records.length === 0 ? <p className="text-sm text-muted">{t('nfc.noRecords')}</p> : (
              <ul className="space-y-1.5">
                {info.records.map((r, i) => (
                  <li key={i} className="rounded-lg bg-surface-low px-3 py-2 text-sm">
                    <span className="font-mono text-[11px] text-muted">{r.type}{r.mediaType ? ` · ${r.mediaType}` : ''} · {r.bytes} B</span>
                    {r.text && <div className="break-words">{r.text}</div>}
                    {r.url && <div className="break-all"><span className="text-xs text-muted">{t('nfc.link')}: </span><span className="font-mono">{r.url}</span></div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="rounded-lg border-l-4 border-gold bg-gold-light px-3 py-2 text-sm">{t('nfc.next')}</p>
        </section>
      )}

      <Lesson h={t('nfc.where.h')} body={t(`nfc.where.${brand}`)} />
      <Lesson h={t('nfc.means.h')} body={t('nfc.means')} />
      <Lesson h={t('nfc.how.h')} body={t('nfc.how')} />
    </div>
  );
}

const Lesson = ({ h, body }: { h: string; body: string }) => (
  <section className="rounded-2xl border border-hairline bg-surface-card p-4">
    <h2 className="text-lg">{h}</h2>
    <p className="mt-1 text-[15px] leading-relaxed">{body}</p>
  </section>
);
