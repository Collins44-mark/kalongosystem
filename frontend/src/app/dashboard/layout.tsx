'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { roleForPermission } from '@/lib/roles';

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {open ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      )}
    </svg>
  );
}

type MeResponse = {
  email: string;
  role: string;
  language?: string;
  business: { id: string; name: string; code: string };
  activeWorkerId?: string | null;
  activeWorkerName?: string | null;
  needsWorkerSelection?: boolean;
  workers?: { id: string; fullName: string }[];
};

const SIDEBAR_LINKS: { href: string; labelKey: string; roles: string[] }[] = [
  { href: '/dashboard', labelKey: 'nav.overview', roles: ['MANAGER', 'ADMIN', 'OWNER'] },
  { href: '/dashboard/front-office', labelKey: 'nav.frontOffice', roles: ['MANAGER', 'ADMIN', 'OWNER', 'FRONT_OFFICE'] },
  { href: '/dashboard/bar', labelKey: 'nav.bar', roles: ['MANAGER', 'BAR'] },
  { href: '/dashboard/restaurant', labelKey: 'nav.restaurant', roles: ['MANAGER', 'RESTAURANT', 'KITCHEN'] },
  { href: '/dashboard/housekeeping', labelKey: 'nav.housekeeping', roles: ['MANAGER', 'HOUSEKEEPING'] },
  { href: '/dashboard/finance', labelKey: 'nav.finance', roles: ['MANAGER', 'FINANCE'] },
  { href: '/dashboard/workers', labelKey: 'nav.workers', roles: ['MANAGER'] },
  { href: '/dashboard/inventory', labelKey: 'nav.inventory', roles: ['MANAGER'] },
  { href: '/dashboard/reports', labelKey: 'nav.reports', roles: ['MANAGER'] },
  { href: '/dashboard/settings', labelKey: 'nav.settings', roles: ['MANAGER'] },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, user, logout, setAuthWithWorker, _hasHydrated } = useAuth();
  const { t, locale, setLocale } = useTranslation();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [langOpen, setLangOpen] = useState(false);
  const [workerSelectId, setWorkerSelectId] = useState('');
  const [workerSelectSaving, setWorkerSelectSaving] = useState(false);

  useEffect(() => {
    if (_hasHydrated && (!token || !user)) {
      router.replace('/login');
    }
  }, [_hasHydrated, token, user, router]);

  useEffect(() => {
    if (!token) {
      setMeLoading(false);
      return;
    }
    setMeLoading(true);
    api<MeResponse>('/api/me', { token })
      .then(setMe)
      .catch((e: unknown) => {
        const err = e as Error & { status?: number };
        if (err?.status === 401) {
          logout();
          router.replace('/login');
        }
        setMe(null);
      })
      .finally(() => setMeLoading(false));
  }, [token, logout, router]);

  const hasSyncedLocaleFromMe = useRef(false);
  useEffect(() => {
    if (me?.language && (me.language === 'en' || me.language === 'sw') && !hasSyncedLocaleFromMe.current) {
      setLocale(me.language);
      hasSyncedLocaleFromMe.current = true;
    }
  }, [me?.language, setLocale]);

  async function changeLanguage(lang: 'en' | 'sw') {
    if (!token || lang === locale) return;
    setLangOpen(false);
    try {
      await api('/api/me', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ language: lang }),
      });
      setLocale(lang);
      setMe((prev) => (prev ? { ...prev, language: lang } : null));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (me?.workers && me.workers.length > 0 && !workerSelectId) setWorkerSelectId(me.workers[0].id);
  }, [me?.needsWorkerSelection, me?.workers]);

  async function submitWorkerSelection() {
    if (!token || !workerSelectId || !me?.workers?.length || !user) return;
    setWorkerSelectSaving(true);
    try {
      const res = await api<{ accessToken: string; worker: { id: string; fullName: string } }>('/auth/select-worker', {
        method: 'POST',
        token,
        body: JSON.stringify({ workerId: workerSelectId }),
      });
      setAuthWithWorker(res.accessToken, user, res.worker);
      setMe((prev) => prev ? { ...prev, needsWorkerSelection: false, workers: [], activeWorkerId: res.worker.id, activeWorkerName: res.worker.fullName } : null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setWorkerSelectSaving(false);
    }
  }

  const roleForNav = roleForPermission(user?.role) || user?.role || '';
  const visibleLinks = SIDEBAR_LINKS.filter((l) => l.roles.includes(roleForNav));
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!_hasHydrated || !token || !user) return null;

  // Mandatory worker selection when role has workers
  if (me?.needsWorkerSelection && me?.workers?.length) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-full max-w-sm p-6 bg-white rounded-lg shadow-md">
          <h1 className="text-xl font-semibold mb-2">{t('auth.selectWorker')}</h1>
          <p className="text-sm text-slate-600 mb-4">{t('auth.selectWorkerHint')}</p>
          <select
            value={workerSelectId}
            onChange={(e) => setWorkerSelectId(e.target.value)}
            className="w-full px-3 py-2 border rounded mb-4"
          >
            {me.workers.map((w) => (
              <option key={w.id} value={w.id}>{w.fullName}</option>
            ))}
          </select>
          <button
            onClick={submitWorkerSelection}
            disabled={workerSelectSaving}
            className="w-full py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
          >
            {workerSelectSaving ? '...' : t('auth.continue')}
          </button>
        </div>
      </div>
    );
  }

  const displayRole = (roleForNav || user?.role || '').replace(/_/g, ' ');
  const displayWorker = (user?.activeWorkerName ?? me?.activeWorkerName) || '';

  return (
    <div className="flex min-h-screen bg-slate-50">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full bg-teal-600 text-white shadow-lg flex items-center justify-center touch-manipulation"
        aria-label={t('nav.toggleMenu')}
      >
        <MenuIcon open={sidebarOpen} />
      </button>
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-56 bg-slate-800 text-white flex flex-col transform transition-transform duration-200 ease-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-4 border-b border-slate-700 min-h-[4.5rem]">
          {meLoading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-slate-600 rounded w-3/4" />
              <div className="h-3 bg-slate-600 rounded w-1/2" />
            </div>
          ) : me?.business ? (
            <>
              <div className="font-semibold">{me.business.name}</div>
              <div className="text-xs text-slate-400">{me.business.code}</div>
            </>
          ) : null}
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setSidebarOpen(false)}
              className={`block px-3 py-2.5 rounded text-sm touch-manipulation ${
                pathname === link.href
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              {t(link.labelKey)}
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t border-slate-700">
          <button
            onClick={() => {
              logout();
              router.replace('/login');
            }}
            className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:text-white"
          >
            {t('nav.logout')}
          </button>
        </div>
      </aside>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <main className="flex-1 overflow-auto min-w-0">
        <header className="h-12 bg-white border-b flex items-center justify-between px-4 gap-2">
          <span className="text-xs sm:text-sm text-slate-600 truncate font-medium uppercase">
            {displayWorker ? `${displayRole} | ${displayWorker}` : displayRole}
          </span>
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 rounded flex items-center gap-1"
            >
              <span>{locale === 'sw' ? 'Kiswahili' : 'English'}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {langOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setLangOpen(false)} aria-hidden />
                <div className="absolute right-0 top-full mt-1 py-1 bg-white border rounded-lg shadow-lg z-20 min-w-[140px]">
                  <button onClick={() => changeLanguage('en')} className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                    {t('nav.english')}
                  </button>
                  <button onClick={() => changeLanguage('sw')} className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                    {t('nav.kiswahili')}
                  </button>
                </div>
              </>
            )}
          </div>
        </header>
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
