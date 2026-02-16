'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSuperAdminAuth } from '@/store/superAdminAuth';
import { api } from '@/lib/api';

type BusinessRow = {
  id: string;
  name: string;
  businessId: string;
  createdAt: string;
  status: 'ACTIVE' | 'SUSPENDED';
  totalUsers: number;
};

export default function SuperAdminDashboardPage() {
  const router = useRouter();
  const token = useSuperAdminAuth((s) => s.token);
  const hasHydrated = useSuperAdminAuth((s) => s._hasHydrated);
  const logout = useSuperAdminAuth((s) => s.logout);
  const [rows, setRows] = useState<BusinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hasHydrated) return;
    if (!token) router.replace('/login');
  }, [hasHydrated, token, router]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api<BusinessRow[]>('/super-admin/businesses', { token })
      .then(setRows)
      .catch((e: any) => setError(e?.message || 'Request failed'))
      .finally(() => setLoading(false));
  }, [token]);

  if (!hasHydrated || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Super Admin Dashboard</h1>
          <button
            type="button"
            onClick={() => { logout(); router.replace('/super-admin'); }}
            className="px-3 py-2 border rounded bg-white text-sm"
          >
            Logout
          </button>
        </div>

        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="p-4 border-b font-medium">Businesses</div>
          {error && <div className="p-4 text-sm text-red-600">{error}</div>}
          {loading ? (
            <div className="p-4 text-sm text-slate-500">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-left text-slate-600">
                    <th className="p-3 font-medium">Business Name</th>
                    <th className="p-3 font-medium">Business ID</th>
                    <th className="p-3 font-medium">Created</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium text-right">Total Users</th>
                    <th className="p-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="p-3">{b.name}</td>
                      <td className="p-3 font-mono text-xs">{b.businessId}</td>
                      <td className="p-3 whitespace-nowrap">{new Date(b.createdAt).toLocaleString()}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${b.status === 'SUSPENDED' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">{b.totalUsers}</td>
                      <td className="p-3">
                        <Link className="text-teal-700 hover:underline text-sm" href={`/super-admin/businesses/${b.id}`}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td className="p-3 text-slate-500" colSpan={6}>No businesses</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

