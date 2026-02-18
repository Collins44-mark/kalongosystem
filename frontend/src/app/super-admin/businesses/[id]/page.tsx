'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useSuperAdminAuth } from '@/store/superAdminAuth';

function UnlockSubscriptionSection({
  businessId,
  subscription,
  onUnlocked,
  token,
}: {
  businessId: string;
  subscription: null | { plan: string; status: string; trialEndsAt: string; currentPeriodEnd?: string | null };
  onUnlocked: () => void;
  token: string | null;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function unlock(durationDays: number) {
    if (!token) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await api<{ success: boolean; message: string }>(
        `/super-admin/businesses/${businessId}/unlock-subscription`,
        { token, method: 'POST', body: JSON.stringify({ durationDays }) }
      );
      setMessage(res.message || 'Subscription unlocked.');
      onUnlocked();
    } catch (e: unknown) {
      setMessage((e as Error)?.message || 'Failed to unlock');
    } finally {
      setSaving(false);
    }
  }

  const [selectedMonths, setSelectedMonths] = useState(1);
  const now = new Date();
  const hasActivePeriod = subscription?.status === 'ACTIVE' && subscription?.currentPeriodEnd && new Date(subscription.currentPeriodEnd) > now;

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="text-xs font-medium text-slate-500 mb-2">Add time / Unlock service</div>
      <p className="text-xs text-slate-600 mb-2">
        {hasActivePeriod
          ? 'Add the selected months to the current subscription period. Service stays active until the new end date.'
          : 'Set service period from today, or add time if expired. When suspended, all roles are blocked until you unlock again.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-600">Duration:</label>
        <select
          value={selectedMonths}
          onChange={(e) => setSelectedMonths(Number(e.target.value))}
          className="border rounded px-2 py-1.5 text-sm"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
            <option key={m} value={m}>{m} month{m !== 1 ? 's' : ''}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={saving}
          onClick={() => unlock(selectedMonths * 30)}
          className="px-3 py-1.5 rounded bg-teal-600 text-white text-xs hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? 'Unlocking...' : 'Unlock'}
        </button>
      </div>
      {message && <p className="text-xs text-slate-600 mt-1">{message}</p>}
    </div>
  );
}

type Detail = {
  business: { id: string; name: string; businessId: string; createdAt: string; status: 'ACTIVE' | 'SUSPENDED' };
  vat: { vat_enabled: boolean; vat_rate: number; vat_type: 'inclusive' | 'exclusive' };
  subscription: null | { plan: string; status: string; trialEndsAt: string; currentPeriodEnd?: string | null };
  users: { businessUserId: string; userId: string; email: string; role: string; status: string; forcePasswordChange: boolean }[];
};

export default function SuperAdminBusinessDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const token = useSuperAdminAuth((s) => s.token);
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) router.replace('/super-admin');
  }, [token, router]);

  function load() {
    if (!token || !id) return;
    setLoading(true);
    api<Detail>(`/super-admin/businesses/${id}`, { token })
      .then(setData)
      .catch((e: any) => setError(e?.message || 'Request failed'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  async function toggleSuspend() {
    if (!token || !data) return;
    const next = data.business.status !== 'SUSPENDED';
    await api(`/super-admin/businesses/${data.business.id}/suspend`, {
      token,
      method: 'POST',
      body: JSON.stringify({ suspended: next }),
    });
    load();
  }

  async function resetPassword(businessUserId: string) {
    if (!token) return;
    const res = await api<{ temporaryPassword: string }>(`/super-admin/business-users/${businessUserId}/reset-password`, {
      token,
      method: 'POST',
    });
    window.alert(`Temporary password generated:\n\n${res.temporaryPassword}`);
    load();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/super-admin/dashboard" className="text-sm text-slate-600 hover:underline">Back</Link>
            <h1 className="text-xl font-semibold">Business Detail</h1>
          </div>
          {data && (
            <button
              type="button"
              onClick={toggleSuspend}
              className={`px-3 py-2 rounded text-sm ${data.business.status === 'SUSPENDED' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
            >
              {data.business.status === 'SUSPENDED' ? 'Activate business' : 'Suspend business'}
            </button>
          )}
        </div>

        {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded border">{error}</div>}
        {loading ? (
          <div className="text-slate-500 text-sm">Loading...</div>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border rounded-lg p-4">
                <div className="text-sm text-slate-500">Business</div>
                <div className="font-medium">{data.business.name}</div>
                <div className="text-xs text-slate-500 font-mono mt-1">{data.business.businessId}</div>
                <div className="text-xs text-slate-500 mt-1">{new Date(data.business.createdAt).toLocaleString()}</div>
                <div className="mt-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${data.business.status === 'SUSPENDED' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {data.business.status}
                  </span>
                </div>
              </div>
              <div className="bg-white border rounded-lg p-4">
                <div className="text-sm text-slate-500">VAT Settings</div>
                <div className="text-sm mt-1">Enabled: {data.vat.vat_enabled ? 'Yes' : 'No'}</div>
                <div className="text-sm">Rate: {Math.round((data.vat.vat_rate || 0) * 100)}%</div>
                <div className="text-sm">Type: {data.vat.vat_type}</div>
              </div>
              <div className="bg-white border rounded-lg p-4">
                <div className="text-sm text-slate-500">Subscription</div>
                {data.subscription ? (
                  <div className="text-sm mt-1 space-y-1">
                    <div>Plan: {data.subscription.plan}</div>
                    <div>Status: {data.subscription.status}</div>
                    <div>Trial ends: {new Date(data.subscription.trialEndsAt).toLocaleDateString()}</div>
                    {data.subscription.currentPeriodEnd && (
                      <div>Period end: {new Date(data.subscription.currentPeriodEnd).toLocaleDateString()}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm mt-1 text-slate-500">No subscription</div>
                )}
                <UnlockSubscriptionSection
                  businessId={data.business.id}
                  subscription={data.subscription ?? null}
                  onUnlocked={load}
                  token={token}
                />
              </div>
            </div>

            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="p-4 border-b font-medium">Users</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-slate-50 border-b">
                    <tr className="text-left text-slate-600">
                      <th className="p-3 font-medium">Email</th>
                      <th className="p-3 font-medium">Role</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Force change</th>
                      <th className="p-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.users.map((u) => (
                      <tr key={u.businessUserId} className="hover:bg-slate-50">
                        <td className="p-3">{u.email}</td>
                        <td className="p-3">{u.role}</td>
                        <td className="p-3">{u.status}</td>
                        <td className="p-3">{u.forcePasswordChange ? 'Yes' : 'No'}</td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => resetPassword(u.businessUserId)}
                            className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-sm"
                          >
                            Reset Password
                          </button>
                        </td>
                      </tr>
                    ))}
                    {data.users.length === 0 && (
                      <tr><td className="p-3 text-slate-500" colSpan={5}>No users</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="text-slate-500 text-sm">Not found</div>
        )}
      </div>
    </div>
  );
}

