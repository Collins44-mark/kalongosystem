'use client';

/**
 * System settings - MANAGER only.
 * Feature flags like Enable Drag & Drop Booking.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { notifyError, notifySuccess } from '@/store/notifications';

type SettingsResponse = { enableDragDropBooking?: boolean };

export function SystemSettingsSection({ token, t }: { token: string; t: (k: string) => string }) {
  const [enableDragDrop, setEnableDragDrop] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<SettingsResponse>('/api/settings', { token })
      .then((s) => setEnableDragDrop(s.enableDragDropBooking === true))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function toggleDragDrop(checked: boolean) {
    setSaving(true);
    try {
      await api('/api/settings', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ enableDragDropBooking: checked }),
      });
      setEnableDragDrop(checked);
      notifySuccess(t('settings.saved'));
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border rounded p-4 max-w-md">
      <h2 className="font-medium mb-2">{t('settings.system')}</h2>
      {loading ? (
        <div className="animate-pulse h-8 bg-slate-100 rounded" />
      ) : (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enableDragDrop}
            onChange={(e) => toggleDragDrop(e.target.checked)}
            disabled={saving}
            className="rounded border-slate-300 text-teal-600"
          />
          <span className="text-sm">{t('settings.enableDragDrop')}</span>
        </label>
      )}
      <p className="text-xs text-slate-500 mt-1">{t('settings.enableDragDropDesc')}</p>
    </div>
  );
}
