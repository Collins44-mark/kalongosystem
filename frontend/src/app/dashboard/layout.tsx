'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { RoleGuard } from '@/components/RoleGuard';
import { auth } from '@/lib/api';

const nav = [
  { href: '/dashboard', label: 'Dashboard', permission: 'view_reports' },
  { href: '/dashboard/bookings', label: 'Bookings & Check-in', permission: 'view_bookings' },
  { href: '/dashboard/pos/restaurant', label: 'Restaurant POS', permission: 'create_pos_order' },
  { href: '/dashboard/pos/bar', label: 'Bar POS', permission: 'create_pos_order' },
  { href: '/dashboard/kitchen', label: 'Kitchen', permission: 'update_pos_order' },
  { href: '/dashboard/housekeeping', label: 'Housekeeping', permission: 'view_housekeeping' },
  { href: '/dashboard/staff', label: 'Staff & Roles', permission: 'manage_roles' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  const handleLogout = async () => {
    auth.clearTokens();
    router.push('/login');
    router.refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Loading…</div>
      </div>
    );
  }
  if (!user) {
    router.push('/login');
    return null;
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 bg-slate-800 text-white flex flex-col">
        <div className="p-6 border-b border-slate-700">
          <h2 className="font-bold text-lg">Kalongo Hotel</h2>
          <p className="text-slate-400 text-sm mt-1">{user.first_name || user.username}</p>
          <p className="text-slate-500 text-xs">{user.role_name || user.department_code}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {nav.map((item) => (
            <RoleGuard key={item.href} permission={item.permission} fallback={null}>
              <Link
                href={item.href}
                className={`block px-4 py-2 rounded-lg text-sm ${
                  pathname === item.href ? 'bg-primary-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                {item.label}
              </Link>
            </RoleGuard>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-700">
          <button onClick={handleLogout} className="text-slate-400 hover:text-white text-sm w-full text-left">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
