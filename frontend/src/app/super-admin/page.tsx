'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useSuperAdminAuth, type SuperAdminUser } from '@/store/superAdminAuth';

/** Super-admin backend: separate login. Only super-admin credentials work here. */
export default function SuperAdminLoginPage() {
  const router = useRouter();
  const token = useSuperAdminAuth((s) => s.token);
  const setAuth = useSuperAdminAuth((s) => s.setAuth);
  const [businessId, setBusinessId] = useState('HMS-1');
  const [email, setEmail] = useState('markkcollins979@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) router.replace('/super-admin/dashboard');
  }, [token, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api<{ accessToken: string; user: unknown }>('/super-admin/login', {
        method: 'POST',
        body: JSON.stringify({
          businessId: businessId.trim().toUpperCase(),
          email: email.trim(),
          password,
        }),
      });
      if (res?.accessToken && res?.user) {
        setAuth(res.accessToken, res.user as SuperAdminUser);
        router.replace('/super-admin/dashboard');
      } else {
        setError('Invalid response from server');
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Invalid credentials';
      const base = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '') : '';
      const seedHint = base
        ? ` If the account does not exist yet, run: ${base}/super-admin/seed?secret=YOUR_SEED_SECRET`
        : ' Run the seed URL (see README) to create the super-admin account.';
      setError(msg === 'Invalid credentials' ? `Invalid credentials.${seedHint}` : msg);
    } finally {
      setLoading(false);
    }
  }

  if (token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={submit} className="w-full max-w-sm p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-xl font-semibold mb-1">Super Admin</h1>
        <p className="text-sm text-slate-500 mb-4">Platform backend — manage all businesses</p>
        {error && (
          <div className="mb-4 p-2 text-sm text-red-600 bg-red-50 rounded">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Business ID</label>
            <input
              type="text"
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="HMS-1"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              required
            />
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
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full py-2 bg-slate-800 text-white rounded hover:bg-slate-900 disabled:opacity-50"
        >
          {loading ? '...' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
