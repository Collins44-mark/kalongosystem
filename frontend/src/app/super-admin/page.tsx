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
                className="px-3 py-2 border rounded bg-white hover:bg-slate-50 inline-flex items-center justify-center"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="w-5 h-5 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.88 5.09A9.8 9.8 0 0112 5c5.5 0 10 7 10 7a18.2 18.2 0 01-4.34 4.79" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6.61 6.61C3.65 8.58 2 12 2 12s4.5 7 10 7c1.04 0 2.05-.19 3-.53" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2 12s4.5-7 10-7 10 7 10 7-4.5 7-10 7-10-7-10-7z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                  </svg>
                )}
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

