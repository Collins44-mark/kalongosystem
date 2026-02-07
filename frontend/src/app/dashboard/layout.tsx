'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

type MeResponse = {
  email: string;
  role: string;
  business: { id: string; name: string; code: string };
};

const SIDEBAR_LINKS: { href: string; label: string; roles: string[] }[] = [
  { href: '/dashboard', label: 'Overview', roles: ['MANAGER'] },
  { href: '/dashboard/front-office', label: 'Front Office', roles: ['MANAGER', 'FRONT_OFFICE'] },
  { href: '/dashboard/bar', label: 'Bar', roles: ['MANAGER', 'BAR'] },
  { href: '/dashboard/restaurant', label: 'Restaurant', roles: ['MANAGER', 'RESTAURANT', 'KITCHEN'] },
  { href: '/dashboard/housekeeping', label: 'Housekeeping', roles: ['MANAGER', 'HOUSEKEEPING'] },
  { href: '/dashboard/finance', label: 'Finance', roles: ['MANAGER', 'FINANCE'] },
  { href: '/dashboard/workers', label: 'Workers', roles: ['MANAGER'] },
  { href: '/dashboard/inventory', label: 'Inventory', roles: ['MANAGER'] },
  { href: '/dashboard/reports', label: 'Reports', roles: ['MANAGER'] },
  { href: '/dashboard/settings', label: 'Settings', roles: ['MANAGER'] },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, user, logout, _hasHydrated } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);

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
      .catch(() => setMe(null))
      .finally(() => setMeLoading(false));
  }, [token]);

  const role = user?.role === 'ADMIN' ? 'MANAGER' : user?.role;
  const visibleLinks = SIDEBAR_LINKS.filter((l) =>
    l.roles.includes(role || '')
  );

  if (!_hasHydrated || !token || !user) return null;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-56 bg-slate-800 text-white flex flex-col">
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
        <nav className="flex-1 p-2 space-y-1">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`block px-3 py-2 rounded text-sm ${
                pathname === link.href
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              {link.label}
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
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <header className="h-12 bg-white border-b flex items-center px-4">
          <span className="text-sm text-slate-600">
            {user.email} · {role}
          </span>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
