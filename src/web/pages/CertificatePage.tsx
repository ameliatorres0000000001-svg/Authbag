import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import qrcode from 'qrcode-generator';
import { useI18n } from '../i18n.tsx';

interface Cert {
  id: string; cert_no: string; public_code: string; brand_id: string; brand: string; model_text: string | null; item_desc: string | null;
  photo_id: string | null; customer_name: string; expert_name: string; issued_at: string; status: 'valid' | 'revoked';
  revoked_reason: string | null; revoked_at: string | null;
}

const GOLD = '#b8922e';
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

/**
 * HENGZ AUTHENTIC expert certificate — public page opened from the QR code, laid out as an A4 sheet
 * that prints (or saves as PDF) exactly as shown. Issued by hand by a named HENGZ expert.
 */
export default function CertificatePage() {
  const { code = '' } = useParams();
  const { t } = useI18n();
  const [c, setC] = useState<Cert | null | undefined>(undefined);
  // on a phone the A4 sheet (794 px) is shown scaled down; printing always uses the real A4 size
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 16) / 794));
    fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit);
  }, []);
  useEffect(() => {
    fetch(`/api/public/cert/${encodeURIComponent(code)}`).then((r) => (r.ok ? r.json() as Promise<{ certificate?: Cert }> : null)).then((d) => setC(d?.certificate ?? null)).catch(() => setC(null));
  }, [code]);
  const url = `${window.location.origin}/certificate/${code}`;
  const qr = useMemo(() => {
    const q = qrcode(0, 'M'); q.addData(url); q.make();
    return q.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
  }, [url]);

  if (c === undefined) return <div className="p-8 text-muted">…</div>;
  if (c === null) return (
    <div className="mx-auto max-w-md p-8 text-center">
      <div className="font-serif text-2xl">HENGZ <span className="text-gold">AUTHENTIC</span></div>
      <p className="mt-4 text-sm">{t('cert.notFound')}</p>
    </div>
  );
  const revoked = c.status === 'revoked';

  return (
    <div className="min-h-screen bg-[#e9e5dc] py-6 print:bg-white print:py-0">
      <style>{`
        @page { size: A4 portrait; margin: 0 }
        @media print { html, body { background: #fff !important } .cert-sheet { box-shadow: none !important; margin: 0 !important } .cert-fit { transform: none !important; height: auto !important; width: auto !important } }
        .cert-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact }
      `}</style>

      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4 print:hidden">
        <div className={`rounded-full px-3 py-1 text-sm font-semibold ${revoked ? 'bg-counterfeit text-white' : 'bg-verified text-white'}`}>
          {revoked ? `✕ ${t('cert.revokedBadge')}` : `✓ ${t('cert.validBadge')}`}
        </div>
        <button type="button" className="btn-primary" onClick={() => window.print()}>⎙ {t('cert.print')}</button>
      </div>

      {/* A4 sheet: 210 × 297 mm */}
      <div className="mx-auto" style={{ width: 794 * scale, height: 1123 * scale }}>
      <div className="cert-fit origin-top-left" style={{ transform: `scale(${scale})`, width: 794 }}>
      <div className="cert-sheet relative overflow-hidden bg-[#fbf8f1] text-[#1d1b16] shadow-xl"
        style={{ width: '210mm', minHeight: '297mm' }}>
        <div className="absolute inset-[7mm] border-[1.5px]" style={{ borderColor: GOLD }} />
        <div className="absolute inset-[9mm] border" style={{ borderColor: `${GOLD}80` }} />
        {revoked && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="-rotate-[24deg] rounded-lg border-[6px] border-counterfeit/70 px-10 py-4 font-serif text-[64px] font-bold tracking-widest text-counterfeit/70">REVOKED</div>
          </div>
        )}

        <div className="relative flex min-h-[297mm] flex-col px-[18mm] pb-[16mm] pt-[17mm]">
          {/* header */}
          <div className="text-center">
            <img src="/icons/icon-192.png" alt="" className="mx-auto h-[22mm] w-[22mm] rounded-xl" />
            <div className="mt-3 font-serif text-[26px] tracking-[0.12em]">HENGZ <span style={{ color: GOLD }}>AUTHENTIC</span></div>
            <div className="mx-auto my-3 h-px w-24" style={{ background: GOLD }} />
            <div className="font-serif text-[22px] uppercase tracking-[0.18em]">Certificate of Expert Verification</div>
            <div className="mt-1 text-[16px]">វិញ្ញាបនបត្រផ្ទៀងផ្ទាត់ដោយអ្នកជំនាញ</div>
          </div>

          {/* number + date */}
          <div className="mt-6 flex justify-between border-y py-2 font-mono text-[12px]" style={{ borderColor: `${GOLD}66` }}>
            <span>No. / លេខ: <b>{c.cert_no}</b></span>
            <span>Issued / ចេញថ្ងៃ: <b>{fmtDate(c.issued_at)}</b></span>
          </div>

          {/* item */}
          <div className="mt-6 grid grid-cols-[48mm_1fr] gap-6">
            <div className="h-[48mm] w-[48mm] overflow-hidden border bg-white" style={{ borderColor: `${GOLD}80` }}>
              {c.photo_id ? <img src={`/api/public/cert/${code}/photo`} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <dl className="grid content-start gap-y-2 text-[13px]">
              <Row en="Brand" km="ម៉ាក" v={c.brand} />
              <Row en="Model" km="ម៉ូដែល" v={c.model_text || '—'} />
              {c.item_desc && <Row en="Description" km="ការពិពណ៌នា" v={c.item_desc} />}
              <Row en="Owner" km="ម្ចាស់" v={c.customer_name} />
            </dl>
          </div>

          {/* statement */}
          <div className="mt-7 rounded-sm border px-6 py-5 text-center" style={{ borderColor: `${GOLD}80`, background: '#fffdf7' }}>
            <div className="font-serif text-[20px] tracking-wide" style={{ color: GOLD }}>VERIFIED BY HENGZ AUTHENTIC EXPERT</div>
            <p className="mt-2 text-[13px] leading-relaxed">
              This item was examined by a HENGZ AUTHENTIC expert from the photographs submitted and was found
              <b> consistent with HENGZ AUTHENTIC references</b>.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed">
              កាបូបនេះត្រូវបានពិនិត្យដោយអ្នកជំនាញ HENGZ AUTHENTIC ពីរូបថតដែលបានផ្ញើមក ហើយ<b>ស្របនឹងរូប reference របស់ HENGZ AUTHENTIC</b>។
            </p>
          </div>

          {/* guarantee */}
          <div className="mt-5 text-[11.5px] leading-relaxed text-[#4a463c]">
            <div className="font-semibold uppercase tracking-wider" style={{ color: GOLD }}>Guarantee / ការធានា</div>
            <p className="mt-1">This guarantee is valid only for a buy-back by HENGZ AUTHENTIC. It covers the item as shown in the photographs on the date of issue,
              not later repairs, replaced parts or alterations. Check that this certificate is valid by scanning the QR code.</p>
            <p className="mt-1">ការធានានេះមានសុពលភាព តែក្នុងករណីទិញចូលវិញដោយ HENGZ AUTHENTIC ប៉ុណ្ណោះ។ វាគ្របដណ្ដប់កាបូបដូចក្នុងរូបថត នៅថ្ងៃចេញវិញ្ញាបនបត្រ
              មិនរាប់បញ្ចូលការជួសជុល ការប្ដូរគ្រឿង ឬការកែប្រែក្រោយនោះទេ។ សូមស្កេន QR ដើម្បីពិនិត្យថាវិញ្ញាបនបត្រនេះនៅមានសុពលភាព។</p>
          </div>

          {/* footer: signature + QR */}
          <div className="mt-auto flex items-end justify-between gap-6 pt-8">
            <div className="min-w-0">
              <div className="h-12 w-56 border-b" style={{ borderColor: '#1d1b16' }} />
              <div className="mt-1 text-[13px] font-semibold">{c.expert_name}</div>
              <div className="text-[11px] text-[#4a463c]">HENGZ AUTHENTIC Expert · អ្នកជំនាញ HENGZ AUTHENTIC</div>
            </div>
            <div className="text-center">
              <div className="h-[28mm] w-[28mm] bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} />
              <div className="mt-1 font-mono text-[9px] text-[#4a463c]">{t('cert.scan')}</div>
            </div>
          </div>
          <div className="mt-3 break-all text-center font-mono text-[9px] text-[#7a7466]">{url}</div>
          {revoked && <div className="mt-2 text-center text-[12px] font-semibold text-counterfeit">REVOKED {c.revoked_at ? fmtDate(c.revoked_at) : ''} · {c.revoked_reason}</div>}
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}

function Row({ en, km, v }: { en: string; km: string; v: string }) {
  return (
    <div className="grid grid-cols-[34mm_1fr] gap-2 border-b pb-1.5" style={{ borderColor: '#e6dfcf' }}>
      <dt className="text-[11px] uppercase tracking-wider text-[#7a7466]">{en}<br /><span className="normal-case tracking-normal">{km}</span></dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}
