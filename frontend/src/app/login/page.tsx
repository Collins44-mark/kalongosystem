'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [businessId, setBusinessId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api<{ accessToken: string; user: unknown }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          businessId: businessId.trim().toUpperCase(),
          email: email.trim(),
          password,
        }),
      });
      setAuth(res.accessToken, res.user as Parameters<typeof setAuth>[1]);
      router.replace('/dashboard');
    } catch (err: unknown) {
      setError((err as Error).message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm p-6 bg-white rounded-lg shadow-md"
      >
        <h1 className="text-xl font-semibold mb-4">Login</h1>
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
              placeholder="HMS-12345"
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
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
        <p className="mt-4 text-center text-sm text-slate-500">
          No account? <Link href="/signup" className="text-teal-600">Sign up</Link>
        </p>
      </form>
    </div>
  );
}
