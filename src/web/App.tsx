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

export interface Me { id: string; email: string; name: string; role: string; locale: 'km' | 'en' }
export const MeContext = React.createContext<Me | null>(null);

const NAV: [string, string][] = [
  ['/', 'dashboard'], ['/datecode', 'datecode'], ['/learn', 'learn'], ['/check', 'check.title'], ['/inspections/new', 'newInspection'], ['/inspections', 'inspections'], ['/knowledge', 'knowledge'],
  ['/coverage', 'coverage'], ['/library', 'library'], ['/providers', 'providers'], ['/certificates', 'certificates'], ['/audit', 'audit'], ['/settings', 'settings'],
];

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
  ['/datecode', 'datecode', 'M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12M3 4h3M3 20h3M18 4h3M18 20h3'],
  ['/check', 'scan', 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8'],
  ['/inspections', 'inspections', 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'],
  ['/knowledge', 'knowledge', 'M5 4h11l3 3v13H5zM9 9h6M9 13h6M9 17h4'],
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

  const refresh = useCallback(() => {
    api.get<Me>('/api/me').then(setMe).catch(() => setMe(null));
  }, []);
  useEffect(refresh, [refresh]);

  // public install screen (works before sign-in); shown once on a phone that has not installed the app
  if (loc.pathname === '/install') return <Install />;
  if (firstPhoneVisit && !installSeen()) return <Navigate to="/install" replace />;
  if (me === undefined) return <div className="p-8 text-muted">…</div>;
  if (me === null) return <Login onDone={refresh} />;

  return (
    <MeContext.Provider value={me}>
      <div className="min-h-screen md:flex">
        <aside className="hidden w-60 shrink-0 border-r border-hairline bg-surface-low md:block">
          <div className="px-5 py-5">
            <Link to="/" onClick={logoTap} className="select-none font-serif text-xl tracking-wide">HENGZ <span className="text-gold">AUTHENTIC</span></Link>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">{me.name} · {me.role}</div>
          </div>
          <nav className="flex flex-col px-2 pb-6">
            {NAV.map(([to, key]) => (
              <NavLink key={to} to={to} end={to === '/' || to === '/inspections'}
                className={({ isActive }) => `rounded px-3 py-2 text-sm ${isActive ? 'bg-charcoal text-white' : 'text-charcoal hover:bg-surface-high'}`}>
                {t(key)}
              </NavLink>
            ))}
          </nav>
          <div className="px-5 pb-5">
            <div className="flex items-center gap-2">
              <LangPicker />
              <Link to="/install" className="btn-ghost !px-2 !py-1 text-xs">⤓ {t('install.open')}</Link>
            </div>
            <button className="mt-3 text-xs text-muted underline" onClick={async () => { await api.post('/api/auth/logout'); setMe(null); nav('/'); }}>{t('signOut')}</button>
          </div>
        </aside>
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-hairline bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
          <Link to="/" onClick={logoTap} className="select-none font-serif text-lg tracking-wide">HENGZ <span className="text-gold">AUTHENTIC</span></Link>
          <div className="flex items-center gap-1.5">
            {!isStandalone() && <Link to="/install" aria-label={t('install.open')} className="btn-ghost !px-2 !py-0.5 text-xs">⤓</Link>}
            <LangPicker />
          </div>
        </header>
        <main className="min-w-0 flex-1 pb-24 md:pb-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
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
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 items-end border-t border-hairline bg-surface/95 px-1 pb-[max(env(safe-area-inset-bottom),0.4rem)] pt-1.5 backdrop-blur md:hidden">
          {TABS.map(([to, key, icon]) => to === '/check' ? (
            <NavLink key={to} to={to} className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-charcoal">
              <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full border-4 border-surface bg-charcoal text-gold shadow-lg"><TabIcon d={icon} /></span>{t(key)}
            </NavLink>
          ) : (
            <NavLink key={to} to={to} end={to === '/' || to === '/inspections'}
              className={({ isActive }) => `flex flex-col items-center gap-0.5 py-0.5 text-[10px] ${isActive ? 'font-bold text-charcoal' : 'text-muted'}`}>
              {({ isActive }) => <><span className={`flex h-7 w-12 items-center justify-center rounded-full ${isActive ? 'bg-gold-light text-charcoal' : ''}`}><TabIcon d={icon} /></span>{t(key)}</>}
            </NavLink>
          ))}
        </nav>
      </div>
    </MeContext.Provider>
  );
}
