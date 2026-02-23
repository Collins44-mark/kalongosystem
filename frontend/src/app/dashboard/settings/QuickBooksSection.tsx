'use client';

import { useEffect, useState } from 'react';
import { notifyError, notifySuccess } from '@/store/notifications';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type QbStatus = {
  connected: boolean;
  realmId: string | null;
  lastSyncAt: string | null;
};

function fmt(d: string | null) {
  if (!d) return '-';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString();
}

export function QuickBooksSection({ token, t }: { token: string; t: (k: string) => string }) {
  const [status, setStatus] = useState<QbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/quickbooks/status`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data?.message as string) || 'Failed to load QuickBooks status');
      setStatus(data as QbStatus);
    } catch (e) {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function connect() {
    setWorking(true);
    try {
      const res = await fetch(`${API_URL}/api/quickbooks/connect`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data?.message as string) || 'QuickBooks connect failed');
      const url = String(data?.url ?? '').trim();
      if (!url) throw new Error('QuickBooks authorization URL missing');
      window.location.href = url;
    } catch (e) {
      notifyError((e as Error).message);
      setWorking(false);
    }
  }

  async function disconnect() {
    setWorking(true);
    try {
      const res = await fetch(`${API_URL}/api/quickbooks/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data?.message as string) || 'QuickBooks disconnect failed');
      notifySuccess(t('settings.quickbooksDisconnected'));
      await load();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const connected = status?.connected === true;

  return (
    <div className="bg-white border rounded p-4 max-w-md">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{t('settings.quickbooks')}</h2>
        <button
          onClick={() => load()}
          disabled={loading || working}
          className="text-xs px-2 py-1 rounded border hover:bg-slate-50 disabled:opacity-60"
          type="button"
        >
          {t('common.refresh')}
        </button>
      </div>

      {loading ? (
        <div className="mt-3 animate-pulse space-y-2">
          <div className="h-10 bg-slate-100 rounded" />
          <div className="h-10 bg-slate-100 rounded" />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">{t('settings.quickbooksStatus')}</span>
              <span className={connected ? 'text-emerald-700 font-medium' : 'text-slate-700 font-medium'}>
                {connected ? t('settings.connected') : t('settings.notConnected')}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-slate-600">{t('settings.lastSync')}</span>
              <span className="text-slate-800">{fmt(status?.lastSyncAt ?? null)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!connected ? (
              <button
                type="button"
                onClick={connect}
                disabled={working}
                className="px-3 py-2 rounded bg-slate-900 text-white text-sm hover:bg-black disabled:opacity-60"
              >
                {working ? t('common.loading') : t('settings.connectQuickbooks')}
              </button>
            ) : (
              <button
                type="button"
                onClick={disconnect}
                disabled={working}
                className="px-3 py-2 rounded bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60"
              >
                {working ? t('common.loading') : t('settings.disconnect')}
              </button>
            )}
          </div>

          <p className="text-xs text-slate-500">{t('settings.quickbooksHint')}</p>
        </div>
      )}
    </div>
  );
}

