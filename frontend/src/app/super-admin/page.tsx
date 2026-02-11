'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useSuperAdminAuth } from '@/store/superAdminAuth';

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const setAuth = useSuperAdminAuth((s) => s.setAuth);

  const [businessId, setBusinessId] = useState('HMS-1');
  const [email, setEmail] = useState('markkcollins979@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api<{ accessToken: string; user: any }>('/super-admin/login', {
        method: 'POST',
        body: JSON.stringify({ businessId, email, password }),
      });
      setAuth(res.accessToken, res.user);
      router.replace('/super-admin/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={submit} className="w-full max-w-sm p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-xl font-semibold mb-4">Super Admin</h1>
        {error && <div className="mb-4 p-2 text-sm text-red-600 bg-red-50 rounded">{error}</div>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Business ID</label>
            <input value={businessId} onChange={(e) => setBusinessId(e.target.value)} className="w-full px-3 py-2 border rounded" required />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border rounded" required />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Password</label>
            <div className="flex gap-2">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="px-3 py-2 border rounded text-sm bg-white hover:bg-slate-50"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>
        <button type="submit" disabled={loading} className="mt-6 w-full py-2 bg-slate-900 text-white rounded hover:bg-slate-800 disabled:opacity-50">
          {loading ? '...' : 'Login'}
        </button>
      </form>
    </div>
  );
}

