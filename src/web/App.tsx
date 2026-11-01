import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import Login from './pages/Login.tsx';
import Dashboard from './pages/Dashboard.tsx';
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

export interface Me { id: string; email: string; name: string; role: string; locale: 'km' | 'en' }
export const MeContext = React.createContext<Me | null>(null);

const NAV: [string, string][] = [
  ['/', 'dashboard'], ['/inspections/new', 'newInspection'], ['/inspections', 'inspections'], ['/knowledge', 'knowledge'],
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

export default function App() {
  const { t, locale, setLocale } = useI18n();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const nav = useNavigate();
  const logoTap = useSecretTaps(() => nav('/admin'));

  const refresh = useCallback(() => {
    api.get<Me>('/api/me').then(setMe).catch(() => setMe(null));
  }, []);
  useEffect(refresh, [refresh]);

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
            <div className="flex gap-2">
              <button className={`btn-ghost !px-3 !py-1 ${locale === 'km' ? '!border-gold' : ''}`} onClick={() => { setLocale('km'); api.put('/api/me/locale', { locale: 'km' }).catch(() => {}); }}>ខ្មែរ</button>
              <button className={`btn-ghost !px-3 !py-1 ${locale === 'en' ? '!border-gold' : ''}`} onClick={() => { setLocale('en'); api.put('/api/me/locale', { locale: 'en' }).catch(() => {}); }}>EN</button>
            </div>
            <button className="mt-3 text-xs text-muted underline" onClick={async () => { await api.post('/api/auth/logout'); setMe(null); nav('/'); }}>{t('signOut')}</button>
          </div>
        </aside>
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-hairline bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
          <Link to="/" onClick={logoTap} className="select-none font-serif text-lg tracking-wide">HENGZ <span className="text-gold">AUTHENTIC</span></Link>
          <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => { const l = locale === 'km' ? 'en' : 'km'; setLocale(l); api.put('/api/me/locale', { locale: l }).catch(() => {}); }}>{locale === 'km' ? 'EN' : 'ខ្មែរ'}</button>
        </header>
        <main className="min-w-0 flex-1 pb-24 md:pb-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inspections" element={<Inspections />} />
            <Route path="/inspections/new" element={<NewInspection />} />
            <Route path="/inspections/:id" element={<InspectionDetail />} />
            <Route path="/inspections/:id/scan" element={<GuidedScan />} />
            <Route path="/inspections/:id/compare/:captureId" element={<Comparator />} />
            <Route path="/studio/:modelId" element={<ModelStudio />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/coverage" element={<Coverage />} />
            <Route path="/library" element={<Library />} />
            <Route path="/providers" element={<Providers />} />
            <Route path="/certificates" element={<Certificates />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-hairline bg-surface/95 px-1 py-2 backdrop-blur md:hidden">
          {NAV.slice(0, 5).map(([to, key]) => (
            <NavLink key={to} to={to} end className={({ isActive }) => `rounded px-2 py-1 text-center text-[11px] ${isActive ? 'font-bold text-gold' : 'text-muted'}`}>{t(key)}</NavLink>
          ))}
        </nav>
      </div>
    </MeContext.Provider>
  );
}
