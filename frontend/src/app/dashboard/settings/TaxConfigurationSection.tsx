'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type Tax = {
  id: string;
  enabled: boolean;
  name: string;
  rate: number; // decimal (0.18)
  type: 'inclusive' | 'exclusive';
  apply: { rooms: boolean; bar: boolean; restaurant: boolean };
};

type SettingsResponse = { taxes?: Tax[] };

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function TaxConfigurationSection({ token, t }: { token: string; t: (k: string) => string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [creating, setCreating] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [name, setName] = useState('VAT 18%');
  const [ratePercent, setRatePercent] = useState('18');
  const [type, setType] = useState<'inclusive' | 'exclusive'>('inclusive');
  const [applyRooms, setApplyRooms] = useState(true);
  const [applyBar, setApplyBar] = useState(true);
  const [applyRestaurant, setApplyRestaurant] = useState(true);

  const canSave = useMemo(() => {
    const pct = Number(ratePercent);
    return name.trim().length > 0 && isFinite(pct) && pct >= 0;
  }, [name, ratePercent]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api<SettingsResponse>('/api/settings', { token })
      .then((s) => setTaxes(Array.isArray(s.taxes) ? s.taxes : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function persist(nextTaxes: Tax[]) {
    if (!token) return;
    setSaving(true);
    try {
      await api('/api/settings', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ taxes: nextTaxes }),
      });
      setTaxes(nextTaxes);
    } catch (e: any) {
      alert(e?.message || 'Request failed');
    } finally {
      setSaving(false);
    }
  }

  async function createTax() {
    if (!canSave) {
      alert(t('common.fillAllFields'));
      return;
    }
    const pct = Number(ratePercent);
    const tax: Tax = {
      id: uid(),
      enabled,
      name: name.trim(),
      rate: Math.max(0, (pct > 1 ? pct / 100 : pct)),
      type,
      apply: { rooms: applyRooms, bar: applyBar, restaurant: applyRestaurant },
    };
    await persist([tax, ...taxes]);
    setCreating(false);
  }

  async function toggleEnabled(id: string, v: boolean) {
    const next = taxes.map((x) => (x.id === id ? { ...x, enabled: v } : x));
    await persist(next);
  }

  return (
    <div className="bg-white border rounded p-4 max-w-md">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">{t('settings.taxConfiguration')}</h2>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="px-3 py-2 rounded text-sm bg-slate-900 text-white hover:bg-slate-800"
          disabled={saving}
        >
          {t('settings.createTax')}
        </button>
      </div>

      {creating && (
        <div className="mt-4 border rounded p-3 bg-slate-50 space-y-3">
          <div className="text-sm font-medium">{t('settings.createTax')}</div>

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
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" disabled={saving} />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('settings.vatRatePercent')}</label>
            <input value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" disabled={saving} inputMode="decimal" />
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

          <div className="flex gap-2">
            <button
              type="button"
              onClick={createTax}
              disabled={saving || !canSave}
              className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 text-sm"
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-4 py-2 border rounded text-sm bg-white hover:bg-slate-50"
              disabled={saving}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          <div className="animate-pulse h-10 bg-slate-100 rounded" />
        ) : taxes.length === 0 ? (
          <div className="text-sm text-slate-500">{t('settings.noTaxes')}</div>
        ) : (
          <div className="space-y-2">
            {taxes.map((x) => (
              <div key={x.id} className="border rounded p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{x.name}</div>
                  <div className="text-xs text-slate-500">
                    {Math.round((Number(x.rate || 0) * 100) * 100) / 100}% · {x.type}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={x.enabled}
                    onChange={(e) => toggleEnabled(x.id, e.target.checked)}
                    disabled={saving}
                  />
                  <span>{t('settings.active')}</span>
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

