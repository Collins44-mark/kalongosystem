'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

type Subscription = { plan: string; status: string; trialEndsAt: string };
type MeResponse = { email: string; role: string; business: { id: string; name: string; code: string } };

export default function SettingsPage() {
  const { token, user } = useAuth();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api<Subscription>('/subscription', { token }).then(setSub).catch(() => setSub(null));
  }, [token]);

  useEffect(() => {
    if (!token) {
      setMeLoading(false);
      return;
    }
    setMeLoading(true);
    api<MeResponse>('/api/me', { token })
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setMeLoading(false));
  }, [token]);

  const isManager = user?.role === 'MANAGER' || user?.role === 'ADMIN';

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold mb-4">Settings</h1>

      <div className="bg-white border rounded p-4 max-w-md">
        <h2 className="font-medium mb-2">Business</h2>
        {meLoading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-slate-200 rounded w-2/3" />
            <div className="h-4 bg-slate-200 rounded w-1/2" />
          </div>
        ) : me?.business ? (
          <div className="text-sm space-y-1">
            <div>Name: {me.business.name}</div>
            <div>Business ID: {me.business.code}</div>
          </div>
        ) : null}
      </div>

      {sub && (
        <div className="bg-white border rounded p-4 max-w-md">
          <h2 className="font-medium mb-2">Subscription</h2>
          <div className="text-sm space-y-1">
            <div>Plan: {sub.plan}</div>
            <div>Status: {sub.status}</div>
            <div>Trial ends: {new Date(sub.trialEndsAt).toLocaleDateString()}</div>
          </div>
        </div>
      )}

      {isManager && (
        <div className="bg-white border rounded p-4 max-w-md">
          <h2 className="font-medium mb-2">Staff Users</h2>
          <p className="text-sm text-slate-600 mb-3">
            Create staff accounts for your team. Coming soon.
          </p>
          <button
            type="button"
            disabled
            className="px-4 py-2 bg-slate-200 text-slate-500 rounded cursor-not-allowed text-sm"
          >
            Create Staff User
          </button>
        </div>
      )}
    </div>
  );
}
