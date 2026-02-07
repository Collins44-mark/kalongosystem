'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';

type SignupRes = {
  accessToken: string;
  user: { id: string; email: string; businessId: string; role: string };
};

export default function SignupPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api<SignupRes>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
          business_name: businessName.trim(),
        }),
      });
      setAuth(res.accessToken, res.user);
      router.replace('/dashboard');
    } catch (err: unknown) {
      setError((err as Error).message || 'Signup failed');
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
        <h1 className="text-xl font-semibold mb-4">{t('auth.signUp')}</h1>
        {error && (
          <div className="mb-4 p-2 text-sm text-red-600 bg-red-50 rounded">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('auth.businessName')}</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder={t('auth.businessNamePlaceholder')}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('auth.passwordMin')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              minLength={6}
              required
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? t('auth.creating') : t('auth.signUp')}
        </button>
        <p className="mt-4 text-center text-sm text-slate-500">
          {t('auth.haveAccount')} <Link href="/login" className="text-teal-600">{t('auth.loginLink')}</Link>
        </p>
      </form>
    </div>
  );
}
