'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type SettingsResponse = {
  vat_enabled?: boolean;
  vat_name?: string;
  vat_rate?: number; // decimal (0.18)
  vat_type?: 'inclusive' | 'exclusive';
  vat_apply_rooms?: boolean;
  vat_apply_bar?: boolean;
  vat_apply_restaurant?: boolean;
};

export function TaxConfigurationSection({ token, t }: { token: string; t: (k: string) => string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [name, setName] = useState('VAT 18%');
  const [ratePercent, setRatePercent] = useState('18');
  const [type, setType] = useState<'inclusive' | 'exclusive'>('inclusive');
  const [applyRooms, setApplyRooms] = useState(true);
  const [applyBar, setApplyBar] = useState(true);
  const [applyRestaurant, setApplyRestaurant] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api<SettingsResponse>('/api/settings', { token })
      .then((s) => {
        setEnabled(s.vat_enabled === true);
        setName((s.vat_name || '').trim() || 'VAT');
        const pct = Math.round(((s.vat_rate ?? 0) * 100) * 100) / 100;
        setRatePercent(String(pct || 0));
        setType(s.vat_type === 'exclusive' ? 'exclusive' : 'inclusive');
        setApplyRooms(s.vat_apply_rooms !== false);
        setApplyBar(s.vat_apply_bar !== false);
        setApplyRestaurant(s.vat_apply_restaurant !== false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function save() {
    if (!token) return;
    const pct = Number(ratePercent);
    if (!isFinite(pct) || pct < 0) {
      alert(t('common.fillAllFields'));
      return;
    }
    setSaving(true);
    try {
      await api('/api/settings', {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          vat_enabled: enabled,
          vat_name: name,
          vat_rate: pct, // backend accepts percent or decimal
          vat_type: type,
          vat_apply_rooms: applyRooms,
          vat_apply_bar: applyBar,
          vat_apply_restaurant: applyRestaurant,
        }),
      });
    } catch (e: any) {
      alert(e?.message || 'Request failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border rounded p-4 max-w-md">
      <h2 className="font-medium mb-2">{t('settings.taxConfiguration')}</h2>
      {loading ? (
        <div className="animate-pulse h-24 bg-slate-100 rounded" />
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={saving}
              className="rounded border-slate-300 text-teal-600"
            />
            <span className="text-sm">{t('settings.enableVat')}</span>
          </label>

          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('settings.vatName')}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm"
              disabled={saving}
              placeholder="VAT 18%"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('settings.vatRatePercent')}</label>
            <input
              value={ratePercent}
              onChange={(e) => setRatePercent(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm"
              disabled={saving}
              inputMode="decimal"
              placeholder="18"
            />
          </div>

          <div>
            <div className="block text-sm text-slate-600 mb-1">{t('settings.vatType')}</div>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={type === 'inclusive'} onChange={() => setType('inclusive')} disabled={saving} />
              <span>{t('settings.vatInclusive')}</span>
            </label>
            <label className="flex items-center gap-2 text-sm mt-1">
              <input type="radio" checked={type === 'exclusive'} onChange={() => setType('exclusive')} disabled={saving} />
              <span>{t('settings.vatExclusive')}</span>
            </label>
          </div>

          <div>
            <div className="block text-sm text-slate-600 mb-1">{t('settings.applyVatOn')}</div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={applyRooms} onChange={(e) => setApplyRooms(e.target.checked)} disabled={saving} />
              <span>{t('settings.applyRooms')}</span>
            </label>
            <label className="flex items-center gap-2 text-sm mt-1">
              <input type="checkbox" checked={applyBar} onChange={(e) => setApplyBar(e.target.checked)} disabled={saving} />
              <span>{t('settings.applyBar')}</span>
            </label>
            <label className="flex items-center gap-2 text-sm mt-1">
              <input type="checkbox" checked={applyRestaurant} onChange={(e) => setApplyRestaurant(e.target.checked)} disabled={saving} />
              <span>{t('settings.applyRestaurant')}</span>
            </label>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 text-sm"
          >
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      )}
    </div>
  );
}

