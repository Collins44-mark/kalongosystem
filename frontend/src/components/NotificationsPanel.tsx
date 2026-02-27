'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { isManagerLevel } from '@/lib/roles';

type AdminAlert = {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  senderRole: string;
  createdAt: string;
  read: boolean;
};

export function NotificationsPanel() {
  const { token, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const isAdmin = isManagerLevel(user?.role);

  const fetchAlerts = useCallback(async () => {
    if (!token || !isAdmin) return;
    setLoading(true);
    try {
      const data = await api<AdminAlert[]>('/notifications', { token });
      setAlerts(Array.isArray(data) ? data : []);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [token, isAdmin]);

  const markAllRead = useCallback(async () => {
    if (!token || !isAdmin) return;
    try {
      await api('/notifications/mark-read', { method: 'POST', token });
      await fetchAlerts();
    } catch {
      /* ignore */
    }
  }, [token, isAdmin, fetchAlerts]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchAlerts();
  }, [isAdmin, fetchAlerts]);

  useEffect(() => {
    if (!isAdmin || !token) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchAlerts();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isAdmin, token, fetchAlerts]);

  const unreadCount = useMemo(() => alerts.filter((a) => !a.read).length, [alerts]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) markAllRead();
  };

  const alertTypeLabel = (type: string) => {
    if (type === 'MAINTENANCE_REQUEST') return 'Maintenance';
    if (type === 'LAUNDRY_REQUEST') return 'Laundry';
    if (type === 'ROLE_MESSAGE') return 'Message';
    return type;
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="relative p-2 rounded hover:bg-slate-100"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6 6 0 1 0-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 0 1-6 0m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] leading-4 min-w-[16px] h-4 px-1 rounded-full text-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full mt-2 w-[320px] max-w-[90vw] bg-white border rounded-lg shadow-lg z-20 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50">
              <div className="text-sm font-medium text-slate-700">Alerts</div>
              <button onClick={() => setOpen(false)} className="text-xs text-slate-600 hover:underline">
                Close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              {loading ? (
                <div className="p-3 text-sm text-slate-500">Loading...</div>
              ) : alerts.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">No alerts</div>
              ) : (
                alerts.map((a) => (
                  <div
                    key={a.id}
                    className={`px-3 py-2 border-b last:border-b-0 ${!a.read ? 'bg-amber-50/50' : ''}`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-teal-700">{alertTypeLabel(a.type)}</div>
                      <div className="text-sm font-medium text-slate-800 break-words">{a.title}</div>
                      <div className="text-sm text-slate-600 break-words mt-0.5">{a.message}</div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        From {a.senderRole} · {new Date(a.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
