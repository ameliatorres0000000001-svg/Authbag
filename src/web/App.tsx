import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import Login from './pages/Login.tsx';
import Dashboard from './pages/Dashboard.tsx';
import FolderPosts from './pages/FolderPosts.tsx';
import AlbumView from './pages/AlbumView.tsx';
import DateCodes from './pages/DateCodes.tsx';
import Install from './pages/Install.tsx';
import LangPicker from './LangPicker.tsx';
import { installSeen, isMobile, isStandalone } from './pwa.ts';
import { STAFF_ROLES } from './studio.ts';
import CertificatePage from './pages/CertificatePage.tsx';
import NewInspection from './pages/NewInspection.tsx';
import Inspections from './pages/Inspections.tsx';
import InspectionDetail from './pages/InspectionDetail.tsx';
import Comparator from './pages/Comparator.tsx';
import GuidedScan from './pages/GuidedScan.tsx';
import Knowledge from './pages/Knowledge.tsx';
import Coverage from './pages/Coverage.tsx';
import Library from './pages/Library.tsx';
import Providers from './pages/Providers.tsx';
import Certificates from './pages/Certificates.tsx';
import Audit from './pages/Audit.tsx';
import Settings from './pages/Settings.tsx';
import ModelStudio from './pages/ModelStudio.tsx';
import AdminPanel from './pages/AdminPanel.tsx';
import Learn from './pages/Learn.tsx';
import Lesson from './pages/Lesson.tsx';
import Check from './pages/Check.tsx';
import NfcCheck from './pages/NfcCheck.tsx';
import EntrupyGuide from './pages/EntrupyGuide.tsx';
import Verify from './pages/Verify.tsx';
import VerifyRequest from './pages/VerifyRequest.tsx';
import Trends from './pages/Trends.tsx';
import Restore from './pages/Restore.tsx';
import RestoreLesson from './pages/RestoreLesson.tsx';
import Paint from './pages/Paint.tsx';
import Membership, { MembershipLine, type MembershipInfo } from './pages/Membership.tsx';
import Repair from './pages/Repair.tsx';
import Authenticity from './pages/Authenticity.tsx';
import Chat from './pages/Chat.tsx';

export interface Me { id: string; email: string; name: string; role: string; locale: 'km' | 'en' }
/** Stand-in for a visitor who has not signed in: read-only, no id. */
const GUEST: Me = { id: '', email: '', name: 'Guest', role: 'guest', locale: 'km' };
export const MeContext = React.createContext<Me | null>(null);

// Customer-facing sections; inspections, knowledge & rules, Entrupy, audit and settings live in the admin panel.
const NAV: [string, string][] = [
  ['/', 'dashboard'], ['/check', 'check.title'], ['/paint', 'paint.title'], ['/verify', 'nav.verify'], ['/chat', 'tab.chat'],
];
// secondary pages, under "More" in the desktop menu
const NAV_MORE: [string, string][] = [['/authenticity', 'home.authentic'], ['/trends', 'home.trends'], ['/datecode', 'datecode'], ['/check/nfc', 'nav.nfc']];

/** Hidden entry to the admin panel: 5 taps on the logo within 3 s. Only a shortcut; the server enforces roles. */
function useSecretTaps(onUnlock: () => void, taps = 5, windowMs = 3000) {
  const hits = useRef<number[]>([]);
  return (e: React.MouseEvent) => {
    const now = Date.now();
    hits.current = [...hits.current.filter((x) => now - x < windowMs), now];
    if (hits.current.length >= taps) { e.preventDefault(); hits.current = []; onUnlock(); }
  };
}

// Mobile tab bar: [route, i18n key, 24×24 SVG path]
const TABS: [string, string, string][] = [
  ['/', 'home', 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z'],
  ['/paint', 'tab.restore', 'M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8 9 15.6l.8-3zM7 13c-2 0-3 1.5-3 3 0 1.3-.7 2.4-2 3 3.5 1.5 8 .5 8-3a3 3 0 0 0-3-3z'],
  ['/check', 'scan', 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8'],
  ['/repair', 'tab.repair', 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z'],
  ['/chat', 'tab.chat', 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM8.5 12h.01M12 12h.01M15.5 12h.01'],
];
const TabIcon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

export default function App() {
  const { t } = useI18n();
  const loc = useLocation();
  const [firstPhoneVisit] = useState(() => isMobile() && !isStandalone() && !installSeen());
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const nav = useNavigate();
  const logoTap = useSecretTaps(() => nav('/admin'));
  // the photo steps live under /verify?mode=… but belong to the Scan tab, not to Certificate
  const inSteps = loc.pathname === '/verify' && new URLSearchParams(loc.search).has('mode');
  const on = (to: string, isActive: boolean) => isActive && !(to === '/verify' && inSteps);

  const refresh = useCallback(() => {
    api.get<Me>('/api/me').then(setMe).catch(() => setMe(null));
  }, []);
  useEffect(refresh, [refresh]);

  // public install screen (works before sign-in); shown once on a phone that has not installed the app
  if (loc.pathname === '/install') return <Install />;
  // public certificate check (QR code), no sign-in needed
  if (loc.pathname.startsWith('/certificate/')) return <Routes><Route path="/certificate/:code" element={<CertificatePage />} /></Routes>;
  if (firstPhoneVisit && !installSeen()) return <Navigate to="/install" replace />;
  if (me === undefined) return <div className="p-8 text-muted">…</div>;
  const back = () => (window.history.length > 1 ? nav(-1) : nav('/'));
  if (loc.pathname === '/login') return <Login onDone={() => { refresh(); back(); }} onClose={back} />;
  // guests browse the feed, albums and date codes; checking a bag needs an account
  const guest = me === null;
  const user: Me = me ?? GUEST;
  // teaching is open to everyone: painting lessons, bag-checking lessons, date codes and market data
  const publicPath = loc.pathname === '/' || /^\/(album|posts|restore|learn)\//.test(loc.pathname) || ['/datecode', '/trends', '/restore', '/authenticity', '/learn', '/paint'].includes(loc.pathname);
  const signOut = async () => { await api.post('/api/auth/logout'); setMe(null); nav('/'); };

  return (
    <MeContext.Provider value={user}>
      <div className="min-h-screen md:flex">
        <aside className="hidden w-60 shrink-0 border-r border-hairline bg-surface-low md:block">
          <div className="px-5 py-5">
            <Link to="/" onClick={logoTap} className="flex select-none items-center gap-2 font-serif text-xl tracking-wide"><img src="/icons/icon-192.png" alt="" width={28} height={28} className="rounded-md" />Anajak <span className="text-gold">Bag</span></Link>
            <div className="mt-2"><AccountButton me={me} onSignOut={signOut} /></div>
          </div>
          <nav className="flex flex-col px-2 pb-6">
            {NAV.map(([to, key]) => (
              <NavLink key={to} to={to} end={to === '/' || to === '/check'}
                className={({ isActive }) => `rounded px-3 py-2 text-sm ${isActive ? 'bg-gold text-charcoal' : 'text-charcoal hover:bg-surface-high'}`}>
                {t(key)}
              </NavLink>
            ))}
            <div className="mt-4 px-3 pb-1 font-mono text-[10px] uppercase tracking-widest text-muted">{t('nav.more')}</div>
            {NAV_MORE.map(([to, key]) => (
              <NavLink key={to} to={to} end
                className={({ isActive }) => `rounded px-3 py-1.5 text-sm ${isActive ? 'bg-gold text-charcoal' : 'text-muted hover:bg-surface-high'}`}>
                {t(key)}
              </NavLink>
            ))}
          </nav>
          <div className="px-5 pb-5">
            <div className="flex items-center gap-2">
              <LangPicker />
              <Link to="/install" className="btn-ghost !px-2 !py-1 text-xs">⤓ {t('install.open')}</Link>
            </div>
          </div>
        </aside>
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gold/15 bg-surface/80 px-4 py-2 backdrop-blur-md md:hidden">
          <Link to="/" onClick={logoTap} className="flex select-none items-center gap-2 font-serif text-lg tracking-wide"><img src="/icons/icon-192.png" alt="" width={26} height={26} className="rounded-md" />Anajak <span className="text-gold">Bag</span></Link>
          <div className="flex items-center gap-1.5">
            {!isStandalone() && <Link to="/install" aria-label={t('install.open')} className="btn-ghost !px-2 !py-0.5 text-xs">⤓</Link>}
            <AccountButton me={me} onSignOut={signOut} />
            <LangPicker />
          </div>
        </header>
        <main className="min-w-0 flex-1 pb-24 md:pb-0">
          {guest && !publicPath ? <SignInGate /> : (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/paint" element={<Paint />} />
            <Route path="/subscribe" element={<Membership />} />
            <Route path="/repair" element={<Repair />} />
            <Route path="/restore" element={<Restore />} />
            <Route path="/restore/:id" element={<RestoreLesson />} />
            <Route path="/authenticity" element={<Authenticity />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/posts/:modelId" element={<FolderPosts />} />
            <Route path="/album/:modelId" element={<AlbumView />} />
            <Route path="/inspections" element={<Inspections />} />
            <Route path="/inspections/new" element={<NewInspection />} />
            <Route path="/inspections/:id" element={<InspectionDetail />} />
            <Route path="/inspections/:id/scan" element={<GuidedScan />} />
            <Route path="/inspections/:id/compare/:captureId" element={<Comparator />} />
            <Route path="/studio/:modelId" element={<ModelStudio />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/learn" element={<Learn />} />
            <Route path="/datecode" element={<DateCodes />} />
            <Route path="/check" element={<Check />} />
            <Route path="/check/nfc" element={<NfcCheck />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/verify/r/:id" element={<VerifyRequest />} />
            <Route path="/verify/entrupy" element={<EntrupyGuide />} />
            <Route path="/learn/:modelId" element={<Lesson />} />
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/coverage" element={<Coverage />} />
            <Route path="/library" element={<Library />} />
            <Route path="/providers" element={<Providers />} />
            <Route path="/certificates" element={<Certificates />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
          )}
        </main>
        <nav className={`fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 items-end border-t border-gold/15 bg-surface/85 px-1 pb-[max(env(safe-area-inset-bottom),0.4rem)] pt-1.5 backdrop-blur md:hidden`}>
          {TABS.map(([to, key, icon]) => to === '/check' ? (
            <NavLink key={to} to={to} className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-ink">
              <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full border-4 border-surface bg-gold text-charcoal shadow-lg"><TabIcon d={icon} /></span>{t(key)}
            </NavLink>
          ) : (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => `flex flex-col items-center gap-0.5 py-0.5 text-[10px] ${on(to, isActive) ? 'font-bold text-gold' : 'text-muted'}`}>
              {({ isActive }) => <><span className={`flex h-7 w-12 items-center justify-center rounded-full ${on(to, isActive) ? 'bg-gold-light text-gold' : ''}`}><TabIcon d={icon} /></span>{t(key)}</>}
            </NavLink>
          ))}
        </nav>
      </div>
    </MeContext.Provider>
  );
}

/** Top-right account button: "Sign in" for guests; the person's initial with a small menu once signed in. */
function AccountButton({ me, onSignOut }: { me: Me | null; onSignOut: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [mb, setMb] = useState<MembershipInfo | null>(null);
  useEffect(() => { if (me) api.get<MembershipInfo>('/api/membership').then(setMb).catch(() => setMb(null)); }, [me]);
  if (!me) return <Link to="/login" className="btn-primary !px-3 !py-1 text-xs">{t('acct.signIn')}</Link>;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-label={t('acct.menu')}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-charcoal font-serif text-sm text-gold">{(me.name || '?').slice(0, 1).toUpperCase()}</button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-30 cursor-default" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-hairline bg-surface-card p-3 text-sm shadow-lg md:left-0 md:right-auto">
            <div className="font-semibold">{me.name}</div>
            <div className="truncate text-xs text-muted">{me.email}</div>
            {mb && mb.status !== 'staff' && <Link to="/subscribe" onClick={() => setOpen(false)} className="mt-2 block"><MembershipLine m={mb} /></Link>}
            {mb && mb.status !== 'staff' && <Link to="/subscribe" onClick={() => setOpen(false)} className="mt-1 block rounded-lg px-2 py-1.5 hover:bg-surface-low">⭐ {t('mb.title')}</Link>}
            <Link to="/verify" onClick={() => setOpen(false)} className="mt-2 block rounded-lg px-2 py-1.5 hover:bg-surface-low">🏅 {t('nav.verify')}</Link>
            {STAFF_ROLES.includes(me.role) && <Link to="/admin" onClick={() => setOpen(false)} className="block rounded-lg px-2 py-1.5 hover:bg-surface-low">🛠 {t('acct.admin')}</Link>}
            <button type="button" onClick={() => { setOpen(false); onSignOut(); }} className="block w-full rounded-lg px-2 py-1.5 text-left text-counterfeit hover:bg-surface-low">{t('signOut')}</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Shown to guests on pages that need an account (scan, NFC, certificates). */
function SignInGate() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 pt-14 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-charcoal text-2xl text-gold" aria-hidden>✦</div>
      <h1 className="text-2xl leading-tight">{t('acct.gateTitle')}</h1>
      <p className="text-sm text-muted">{t('acct.gateBody')}</p>
      <div className="flex flex-col gap-2">
        <Link to="/login?mode=register" className="btn-primary !py-3">{t('acct.create')}</Link>
        <Link to="/login" className="btn-ghost !py-3">{t('acct.signIn')}</Link>
      </div>
    </div>
  );
}
