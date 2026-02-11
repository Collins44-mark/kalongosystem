'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

export default function ChangePasswordPage() {
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !user) return;
    setError('');
    setLoading(true);
    try {
      await api('/auth/change-password', {
        token,
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      // Force a clean re-login (also re-triggers worker selection for role-based users)
      router.replace('/login');
    } catch (err: any) {
      setError(err?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  if (!token || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-full max-w-sm p-6 bg-white rounded-lg shadow-md">
          <h1 className="text-xl font-semibold mb-2">Change password</h1>
          <p className="text-sm text-slate-600">Please log in first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={submit} className="w-full max-w-sm p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-xl font-semibold mb-2">Change password</h1>
        <p className="text-sm text-slate-600 mb-4">You must set a new password to continue.</p>

        {error && <div className="mb-4 p-2 text-sm text-red-600 bg-red-50 rounded">{error}</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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
          {loading ? '...' : 'Save password'}
        </button>
      </form>
    </div>
  );
}

