'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { defaultDashboardRoute } from '@/lib/homeRoute';

type LoginUser = { id: string; email: string; name?: string; businessId: string; role: string };
type Worker = { id: string; fullName: string };

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const setAuthWithWorker = useAuth((s) => s.setAuthWithWorker);
  const setPendingWorkerSelection = useAuth((s) => s.setPendingWorkerSelection);
  const pendingWorkerSelection = useAuth((s) => s.pendingWorkerSelection);
  const { t } = useTranslation();
  const [businessId, setBusinessId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusinessId, setForgotBusinessId] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [workerId, setWorkerId] = useState('');
  const [loginUser, setLoginUser] = useState<LoginUser | null>(null);
  const [loginToken, setLoginToken] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api<{
        accessToken?: string;
        access_token?: string;
        user: LoginUser;
        needsWorkerSelection?: boolean;
        workers?: Worker[];
        forcePasswordChange?: boolean;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          businessId: businessId.trim().toUpperCase(),
          email: email.trim(),
          password,
        }),
      });
      const token = res.accessToken ?? res.access_token;
      if (!token) throw new Error('No token received from server');
      const user = res.user as LoginUser;

      // Force-change only for MANAGER (admin), not role-based workers.
      if (res.forcePasswordChange && user.role === 'MANAGER') {
        setAuth(token, user);
        router.replace('/change-password');
      } else if (res.needsWorkerSelection && res.workers && res.workers.length > 0) {
        setLoginToken(token);
        setLoginUser(user);
        setPendingWorkerSelection(res.workers);
        setWorkerId(res.workers[0]?.id ?? '');
      } else {
        setAuth(token, user);
        router.replace(defaultDashboardRoute(user.role));
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleWorkerSelect(e: React.FormEvent) {
    e.preventDefault();
    if (!loginToken || !loginUser || !workerId) return;
    setError('');
    setLoading(true);
    try {
      const res = await api<{ accessToken: string; worker: { id: string; fullName: string } }>('/auth/select-worker', {
        method: 'POST',
        token: loginToken,
        body: JSON.stringify({ workerId }),
      });
      setAuthWithWorker(res.accessToken, loginUser, res.worker);
      setPendingWorkerSelection(null);
      setLoginToken(null);
      setLoginUser(null);
      router.replace(defaultDashboardRoute(loginUser.role));
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to select worker');
    } finally {
      setLoading(false);
    }
  }

  function backToLogin() {
    setPendingWorkerSelection(null);
    setLoginToken(null);
    setLoginUser(null);
    setWorkerId('');
    setError('');
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotMsg('');
    setError('');
    setLoading(true);
    try {
      const res = await api<{ success: boolean; temporaryPassword?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          businessId: (forgotBusinessId || businessId).trim().toUpperCase(),
          email: (forgotEmail || email).trim(),
        }),
      });
      if (res?.temporaryPassword) {
        setForgotMsg(`Temporary password generated: ${res.temporaryPassword}`);
      } else {
        setForgotMsg('If the Business ID + email match an admin account, a temporary password was generated.');
      }
    } catch (err: any) {
      setForgotMsg(err?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  // Worker selection screen (after login when role has workers)
  if (pendingWorkerSelection && loginUser && loginToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <form onSubmit={handleWorkerSelect} className="w-full max-w-sm p-6 bg-white rounded-lg shadow-md">
          <h1 className="text-xl font-semibold mb-2">{t('auth.selectWorker')}</h1>
          <p className="text-sm text-slate-600 mb-4">{t('auth.selectWorkerHint')}</p>
          {error && (
            <div className="mb-4 p-2 text-sm text-red-600 bg-red-50 rounded">{error}</div>
          )}
          <div className="mb-4">
            <label className="block text-sm text-slate-600 mb-1">{t('auth.worker')}</label>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              required
            >
              {pendingWorkerSelection.workers.map((w) => (
                <option key={w.id} value={w.id}>{w.fullName}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
          >
            {loading ? '...' : t('auth.continue')}
          </button>
          <button
            type="button"
            onClick={backToLogin}
            className="w-full mt-2 py-2 text-slate-600 hover:text-slate-800"
          >
            {t('common.back')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm p-6 bg-white rounded-lg shadow-md"
      >
        <h1 className="text-xl font-semibold mb-4">{t('auth.login')}</h1>
        {error && (
          <div className="mb-4 p-2 text-sm text-red-600 bg-red-50 rounded">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('auth.businessId')}</label>
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
            <label className="block text-sm text-slate-600 mb-1">{t('auth.password')}</label>
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
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? t('auth.loggingIn') : t('auth.login')}
        </button>

        <button
          type="button"
          onClick={() => { setForgotOpen((v) => !v); setForgotMsg(''); }}
          className="mt-3 w-full text-sm text-slate-600 hover:text-slate-800"
        >
          Forgot password?
        </button>

        {forgotOpen && (
          <div className="mt-3 p-3 border rounded bg-slate-50 space-y-2">
            <div className="text-sm font-medium text-slate-700">Reset admin password</div>
            <div className="text-xs text-slate-600">
              This is only for MANAGER (admin). The system generates a temporary password, then you must change it after login.
            </div>
            <form onSubmit={submitForgot} className="space-y-2">
              <input
                value={forgotBusinessId}
                onChange={(e) => setForgotBusinessId(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm"
                placeholder="Business ID (HMS-12345)"
              />
              <input
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm"
                placeholder="Admin email"
              />
              <button type="submit" disabled={loading} className="w-full py-2 bg-slate-900 text-white rounded text-sm disabled:opacity-50">
                {loading ? '...' : 'Send temporary password'}
              </button>
            </form>
            {forgotMsg && <div className="text-xs text-slate-700">{forgotMsg}</div>}
          </div>
        )}

        <p className="mt-4 text-center text-sm text-slate-500">
          {t('auth.noAccount')} <Link href="/signup" className="text-teal-600">{t('auth.signUpLink')}</Link>
        </p>
      </form>
    </div>
  );
}
