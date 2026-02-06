'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/store/auth';

const SIDEBAR_LINKS: { href: string; label: string; roles: string[] }[] = [
  { href: '/dashboard', label: 'Overview', roles: ['ADMIN'] },
  { href: '/dashboard/front-office', label: 'Front Office', roles: ['ADMIN', 'FRONT_OFFICE'] },
  { href: '/dashboard/bar', label: 'Bar', roles: ['ADMIN', 'BAR'] },
  { href: '/dashboard/restaurant', label: 'Restaurant', roles: ['ADMIN', 'RESTAURANT', 'KITCHEN'] },
  { href: '/dashboard/housekeeping', label: 'Housekeeping', roles: ['ADMIN', 'HOUSEKEEPING'] },
  { href: '/dashboard/finance', label: 'Finance', roles: ['ADMIN', 'FINANCE'] },
  { href: '/dashboard/workers', label: 'Workers', roles: ['ADMIN'] },
  { href: '/dashboard/inventory', label: 'Inventory', roles: ['ADMIN'] },
  { href: '/dashboard/reports', label: 'Reports', roles: ['ADMIN', 'FINANCE'] },
  { href: '/dashboard/settings', label: 'Settings', roles: ['ADMIN'] },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, user, logout } = useAuth();

  useEffect(() => {
    if (!token || !user) {
      router.replace('/login');
    }
  }, [token, user, router]);

  const visibleLinks = SIDEBAR_LINKS.filter((l) =>
    l.roles.includes(user?.role || '')
  );

  if (!token || !user) return null;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-56 bg-slate-800 text-white flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <div className="font-semibold">HMS</div>
          <div className="text-xs text-slate-400">{user.businessId}</div>
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
            {user.email} · {user.role}
          </span>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
