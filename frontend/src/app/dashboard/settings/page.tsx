'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

type Subscription = { plan: string; status: string; trialEndsAt: string };

export default function SettingsPage() {
  const { token } = useAuth();
  const [sub, setSub] = useState<Subscription | null>(null);

  useEffect(() => {
    if (!token) return;
    api<Subscription>('/subscription', { token }).then(setSub);
  }, [token]);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Settings</h1>
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
    </div>
  );
}
