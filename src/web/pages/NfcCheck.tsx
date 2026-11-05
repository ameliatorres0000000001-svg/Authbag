import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { nfcSupported, useNfcScan, type NfcInfo } from '../NfcRead.tsx';
import { chipFacts } from '../../shared/nfc.ts';

type Brand = 'lv' | 'chanel' | 'other';
interface Seen { before: number; otherAccounts: number; firstSeen: string | null }
interface HistoryItem { serial: string; brand: Brand; at: string }

const HISTORY_KEY = 'hz_nfc_history';
const readHistory = (): HistoryItem[] => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } };

/**
 * NFC chip reader: a radar-style scanner, where the chip sits for each brand, and what the phone could read
 * (chip ID, chip maker, stored links, whether the same chip ID was read before on other accounts).
 * Facts and signals for the expert only: a readable chip never proves a bag genuine, an unreadable one never proves it fake.
 */
export default function NfcCheck() {
  const { t } = useI18n();
  const [brand, setBrand] = useState<Brand>('lv');
  const [info, setInfo] = useState<NfcInfo | null>(null);
  const [seen, setSeen] = useState<Seen | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(readHistory);
  const [copied, setCopied] = useState(false);
  const supported = nfcSupported();

  const scan = useNfcScan((i) => {
    setInfo(i); setSeen(null); setCopied(false);
    if (i.serial) {
      api.post<Seen>('/api/nfc/scans', { uid: i.serial, brand }).then(setSeen).catch(() => setSeen(null));
      const next = [{ serial: i.serial, brand, at: new Date().toISOString() }, ...readHistory().filter((h) => h.serial !== i.serial)].slice(0, 10);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      setHistory(next);
    }
  });
  useEffect(() => () => scan.cancel(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const facts = useMemo(() => (info ? chipFacts(info.serial, info.records.map((r) => r.url).filter(Boolean) as string[], brand) : null), [info, brand]);
  const progress = scan.state === 'scanning' ? scan.left / scan.seconds : 1;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 pb-10 pt-5 md:px-8">
      <header>
        <h1 className="text-[28px] leading-tight">{t('nfc.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('nfc.subtitle')}</p>
      </header>

      {/* brand */}
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-hairline bg-surface-card p-1" role="tablist" aria-label={t('nfc.brand')}>
        {([['lv', 'Louis Vuitton'], ['chanel', 'Chanel'], ['other', t('nfc.otherBrand')]] as const).map(([k, name]) => (
          <button key={k} type="button" role="tab" aria-selected={brand === k} onClick={() => setBrand(k)}
            className={`rounded-xl px-2 py-2 text-sm font-semibold transition ${brand === k ? 'bg-charcoal text-white' : 'text-muted'}`}>{name}</button>
        ))}
      </div>

      {/* scanner */}
      <section className="relative overflow-hidden rounded-3xl bg-charcoal px-5 pb-6 pt-8 text-white">
        {supported ? (
          <>
            <button type="button" onClick={scan.state === 'scanning' ? scan.cancel : scan.start}
              className="relative mx-auto flex h-52 w-52 items-center justify-center rounded-full" aria-label={scan.state === 'scanning' ? t('nfc.cancel') : t('nfc.read')}>
              {/* rings */}
              {scan.state === 'scanning' && [0, 1, 2].map((i) => (
                <span key={i} className="absolute inset-0 rounded-full border-2 border-gold/60" style={{ animation: `hz-radar 2.4s ease-out ${i * 0.8}s infinite` }} />
              ))}
              {/* countdown ring */}
              <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
                <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                <circle cx="50" cy="50" r="46" fill="none" stroke={scan.state === 'done' ? '#4f8f6a' : scan.state === 'error' ? '#b5483f' : '#c9a24a'} strokeWidth="3"
                  strokeDasharray={`${progress * 289} 289`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s linear' }} />
              </svg>
              <span className={`relative flex h-36 w-36 flex-col items-center justify-center rounded-full ${scan.state === 'scanning' ? 'bg-gold text-charcoal' : 'bg-white/5'}`}>
                <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                  <path d="M6 18a8 8 0 0 1 0-12M9.5 15a4 4 0 0 1 0-6M18 6a8 8 0 0 1 0 12M14.5 9a4 4 0 0 1 0 6" />
                </svg>
                <span className="mt-1.5 text-sm font-semibold">
                  {scan.state === 'scanning' ? `${scan.left}s` : scan.state === 'done' ? `✓ ${t('nfc.readOk')}` : t('nfc.tap')}
                </span>
              </span>
            </button>
            <p className="mt-5 text-center text-sm text-white/80">{scan.state === 'scanning' ? t('nfc.scanning') : t('nfc.howShort')}</p>
            {scan.state === 'scanning' && <div className="mt-2 text-center"><button type="button" className="text-xs text-white/60 underline" onClick={scan.cancel}>{t('nfc.cancel')}</button></div>}
            {scan.state === 'error' && scan.msg && <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-center text-xs text-white/80">{scan.msg}</p>}
          </>
        ) : (
          <div className="space-y-2 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-2xl" aria-hidden>📵</div>
            <div className="font-serif text-lg">{t('nfc.noSupportTitle')}</div>
            <p className="text-sm text-white/70">{t('nfc.unsupported')}</p>
          </div>
        )}
        <style>{`@keyframes hz-radar { from { transform: scale(.7); opacity: .9 } to { transform: scale(1.35); opacity: 0 } } @media (prefers-reduced-motion: reduce) { [style*="hz-radar"] { animation: none !important } }`}</style>
      </section>

      {/* result */}
      {info && facts && (
        <section className="space-y-3 rounded-2xl border border-gold bg-surface-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl">{t('nfc.result')}</h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{new Date().toLocaleTimeString()}</span>
          </div>

          <div className="rounded-xl bg-surface-low p-3">
            <div className="label">{t('nfc.uid')}</div>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 break-all font-mono text-lg font-semibold">{info.serial || '—'}</div>
              {info.serial && (
                <button type="button" className="btn-ghost shrink-0 !px-2 !py-1 text-xs"
                  onClick={() => { navigator.clipboard?.writeText(info.serial).then(() => setCopied(true)).catch(() => {}); }}>{copied ? '✓' : t('nfc.copy')}</button>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Fact k={t('nfc.maker')} v={facts.maker ?? t('nfc.makerUnknown')} />
            <Fact k={t('nfc.idType')} v={`${facts.bytes} bytes · ${t(`nfc.kind.${facts.kind}`)}`} />
          </dl>

          {/* seen before: a signal for the expert, never a verdict */}
          {seen && (
            <div className={`rounded-xl px-3 py-2 text-sm ${seen.otherAccounts > 0 ? 'border border-counterfeit/40 bg-counterfeit/5' : 'bg-verified/10'}`}>
              {seen.otherAccounts > 0
                ? <>⚠ {t('nfc.seenOthers').replace('{n}', String(seen.otherAccounts))}</>
                : seen.before > 0 ? <>↺ {t('nfc.seenMine')}</> : <>✦ {t('nfc.seenNever')}</>}
            </div>
          )}

          <div>
            <div className="label">{t('nfc.records')}</div>
            {info.records.length === 0 ? <p className="text-sm text-muted">{t('nfc.noRecords')}</p> : (
              <ul className="space-y-1.5">
                {info.records.map((r, i) => {
                  const link = r.url ? facts.links.find((l) => l.url === r.url) : null;
                  return (
                    <li key={i} className="rounded-lg bg-surface-low px-3 py-2 text-sm">
                      <span className="font-mono text-[11px] text-muted">{r.type}{r.mediaType ? ` · ${r.mediaType}` : ''} · {r.bytes} B</span>
                      {r.text && <div className="break-words">{r.text}</div>}
                      {r.url && (
                        <div className="break-all">
                          <span className="font-mono">{r.url}</span>
                          {link?.official === true && <div className="text-xs text-verified">✓ {t('nfc.linkOfficial')}</div>}
                          {link?.official === false && <div className="text-xs text-counterfeit">⚠ {t('nfc.linkUnknown').replace('{host}', link.host)}</div>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="rounded-lg border-l-4 border-gold bg-gold-light px-3 py-2 text-sm">{t('nfc.means')}</p>
          <Link to="/check" className="btn-primary flex w-full justify-center !py-3">{t('nfc.toExpert')} →</Link>
        </section>
      )}

      {/* where the chip is */}
      <section className="flex gap-4 rounded-2xl border border-hairline bg-surface-card p-4">
        <ChipMap brand={brand} />
        <div className="min-w-0">
          <h2 className="text-lg">{t('nfc.where.h')}</h2>
          <p className="mt-1 text-[15px] leading-relaxed">{t(`nfc.where.${brand}`)}</p>
        </div>
      </section>

      {history.length > 0 && (
        <section className="rounded-2xl border border-hairline bg-surface-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">{t('nfc.history')}</h2>
            <button type="button" className="text-xs text-muted underline" onClick={() => { try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ } setHistory([]); }}>{t('nfc.clear')}</button>
          </div>
          <ul className="mt-2 divide-y divide-hairline text-sm">
            {history.map((h) => (
              <li key={h.serial} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate font-mono">{h.serial}</span>
                <span className="shrink-0 text-xs text-muted">{h.brand === 'lv' ? 'LV' : h.brand === 'chanel' ? 'Chanel' : '…'} · {new Date(h.at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const Fact = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-xl bg-surface-low px-3 py-2">
    <dt className="text-[11px] text-muted">{k}</dt>
    <dd className="font-semibold leading-snug">{v}</dd>
  </div>
);

/** A small bag outline with a pulsing dot where the chip usually sits for this brand. */
function ChipMap({ brand }: { brand: Brand }) {
  const dot = brand === 'lv' ? { x: 62, y: 58 } : brand === 'chanel' ? { x: 50, y: 66 } : null;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0" aria-hidden>
      <path d="M30 34c0-11 9-18 20-18s20 7 20 18" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
      <rect x="14" y="34" width="72" height="54" rx="8" fill="none" stroke="currentColor" strokeWidth="3" className="text-charcoal" />
      <rect x="22" y="44" width="56" height="36" rx="4" fill="none" stroke="currentColor" strokeDasharray="3 3" strokeWidth="1.5" className="text-muted" />
      {dot ? (
        <>
          <circle cx={dot.x} cy={dot.y} r="9" className="animate-ping fill-gold/40" style={{ transformOrigin: `${dot.x}px ${dot.y}px` }} />
          <circle cx={dot.x} cy={dot.y} r="5" className="fill-gold" />
        </>
      ) : <text x="50" y="66" textAnchor="middle" className="fill-muted" fontSize="14">?</text>}
    </svg>
  );
}
