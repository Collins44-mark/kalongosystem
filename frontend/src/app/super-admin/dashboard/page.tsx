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
  const [showRegister, setShowRegister] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerType, setRegisterType] = useState('HOTEL');
  const [registerLocation, setRegisterLocation] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerSaving, setRegisterSaving] = useState(false);
  const [registerMessage, setRegisterMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function loadBusinesses() {
    if (!token) return;
    setLoading(true);
    api<{ businesses: BusinessRow[]; total: number }>('/super-admin/businesses', { token })
      .then((res) => setRows(res.businesses ?? []))
      .catch((e: any) => setError(e?.message || 'Request failed'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!hasHydrated) return;
    if (!token) router.replace('/login');
  }, [hasHydrated, token, router]);

  useEffect(() => {
    loadBusinesses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function submitRegister() {
    if (!token || !registerName.trim()) return;
    setRegisterSaving(true);
    setRegisterMessage(null);
    try {
      const res = await api<{ success: boolean; message: string; business: { businessId: string; name: string } }>(
        '/super-admin/businesses',
        { token, method: 'POST', body: JSON.stringify({
          name: registerName.trim(),
          businessType: registerType,
          location: registerLocation.trim() || undefined,
          phone: registerPhone.trim() || undefined,
        }) }
      );
      setRegisterMessage({ type: 'ok', text: `Registered. Business ID: ${res.business.businessId}. Share this with the client to sign up.` });
      setRegisterName('');
      setRegisterLocation('');
      setRegisterPhone('');
      setRegisterType('HOTEL');
      loadBusinesses();
      setShowRegister(false);
    } catch (e: any) {
      setRegisterMessage({ type: 'err', text: e?.message || 'Failed to register' });
    } finally {
      setRegisterSaving(false);
    }
  }

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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-semibold">Super Admin Dashboard</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowRegister(true); setRegisterMessage(null); }}
              className="px-3 py-2 rounded bg-teal-600 text-white text-sm hover:bg-teal-700"
            >
              Register business
            </button>
            <button
              type="button"
              onClick={() => { logout(); router.replace('/super-admin'); }}
              className="px-3 py-2 border rounded bg-white text-sm"
            >
              Logout
            </button>
          </div>
        </div>

        {showRegister && (
          <div className="bg-white border rounded-lg p-4 shadow-sm">
            <h2 className="font-medium mb-3">Register new business</h2>
            {registerMessage && (
              <div className={`mb-3 p-2 rounded text-sm ${registerMessage.type === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                {registerMessage.text}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Business name *</label>
                <input
                  type="text"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="e.g. Sunset Hotel"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Type</label>
                <select
                  value={registerType}
                  onChange={(e) => setRegisterType(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="HOTEL">Hotel</option>
                  <option value="LODGE">Lodge</option>
                  <option value="BAR">Bar</option>
                  <option value="RESTAURANT">Restaurant</option>
                  <option value="TRANSPORT">Transport</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Location</label>
                <input
                  type="text"
                  value={registerLocation}
                  onChange={(e) => setRegisterLocation(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Phone</label>
                <input
                  type="text"
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={registerSaving}
                onClick={submitRegister}
                className="px-4 py-2 rounded bg-teal-600 text-white text-sm hover:bg-teal-700 disabled:opacity-50"
              >
                {registerSaving ? 'Saving...' : 'Register'}
              </button>
              <button
                type="button"
                onClick={() => { setShowRegister(false); setRegisterMessage(null); }}
                className="px-4 py-2 border rounded bg-white text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="p-4 border-b font-medium">Businesses ({rows.length})</div>
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

