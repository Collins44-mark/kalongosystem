'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

const BUSINESS_TYPES = ['HOTEL', 'LODGE', 'BAR', 'RESTAURANT'];

export default function RegisterBusinessPage() {
  const router = useRouter();
  const { token, setAuth } = useAuth();
  const [businessType, setBusinessType] = useState('HOTEL');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !token) {
      router.replace('/signup');
    }
  }, [mounted, token, router]);

  if (!mounted || !token) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api<{
        accessToken: string;
        user: { id: string; email: string; businessId: string; role: string };
      }>('/business/register', {
        method: 'POST',
        token,
        body: JSON.stringify({
          businessType,
          name: name.trim(),
          location: location.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });
      setAuth(res.accessToken, res.user);
      router.replace('/dashboard');
    } catch (err: unknown) {
      setError((err as Error).message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md p-6 bg-white rounded-lg shadow-md"
      >
        <h1 className="text-xl font-semibold mb-4">Register Your Business</h1>
        {error && (
          <div className="mb-4 p-2 text-sm text-red-600 bg-red-50 rounded">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Business Type</label>
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            >
              {BUSINESS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Business Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Phone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? 'Registering...' : 'Register Business'}
        </button>
      </form>
    </div>
  );
}
