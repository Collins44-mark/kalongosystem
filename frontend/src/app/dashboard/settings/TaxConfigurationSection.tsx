'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type Tax = {
  id: string;
  enabled: boolean;
  name: string;
  rate: number;
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
  const [editing, setEditing] = useState<Tax | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [name, setName] = useState('');
  const [ratePercent, setRatePercent] = useState('');
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

  function resetForm() {
    setName('');
    setRatePercent('');
    setType('inclusive');
    setEnabled(true);
    setApplyRooms(true);
    setApplyBar(true);
    setApplyRestaurant(true);
    setCreating(false);
    setEditing(null);
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
    resetForm();
  }

  function startEdit(x: Tax) {
    setEditing(x);
    setName(x.name);
    const pct = Math.round((Number(x.rate || 0) * 100) * 100) / 100;
    setRatePercent(String(pct));
    setType(x.type);
    setEnabled(x.enabled);
    setApplyRooms(x.apply?.rooms !== false);
    setApplyBar(x.apply?.bar !== false);
    setApplyRestaurant(x.apply?.restaurant !== false);
  }

  async function saveEdit() {
    if (!editing || !canSave) return;
    const pct = Number(ratePercent);
    const updated: Tax = {
      ...editing,
      enabled,
      name: name.trim(),
      rate: Math.max(0, (pct > 1 ? pct / 100 : pct)),
      type,
      apply: { rooms: applyRooms, bar: applyBar, restaurant: applyRestaurant },
    };
    await persist(taxes.map((x) => (x.id === editing.id ? updated : x)));
    resetForm();
  }

  async function deleteTax(id: string) {
    if (!confirm(t('settings.deleteTaxConfirm'))) return;
    await persist(taxes.filter((x) => x.id !== id));
  }

  async function toggleEnabled(id: string, v: boolean) {
    const next = taxes.map((x) => (x.id === id ? { ...x, enabled: v } : x));
    await persist(next);
  }

  const showForm = creating || editing;

  return (
    <div className="bg-white border rounded p-4 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">{t('settings.taxConfiguration')}</h2>
        <button
          type="button"
          onClick={() => { resetForm(); setCreating(true); }}
          className="px-3 py-2 rounded text-sm bg-slate-900 text-white hover:bg-slate-800"
          disabled={saving}
        >
          {t('settings.createTax')}
        </button>
      </div>

      {showForm && (
        <div className="mt-4 border rounded p-3 bg-slate-50 space-y-3">
          <div className="text-sm font-medium">{editing ? t('settings.editTax') : t('settings.createTax')}</div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={saving}
              className="rounded border-slate-300 text-teal-600"
            />
            <span className="text-sm">{t('settings.enableTax')}</span>
          </label>

          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('settings.taxName')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" disabled={saving} placeholder="e.g. VAT 18%" />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('settings.taxRatePercent')}</label>
            <input value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" disabled={saving} inputMode="decimal" placeholder="18" />
          </div>

          <div>
            <div className="block text-sm text-slate-600 mb-1">{t('settings.taxType')}</div>
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
            <div className="block text-sm text-slate-600 mb-1">{t('settings.applyTaxOn')}</div>
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
              onClick={editing ? saveEdit : createTax}
              disabled={saving || !canSave}
              className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 text-sm"
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
            <button
              type="button"
              onClick={resetForm}
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-3">{t('settings.taxName')}</th>
                  <th className="text-left p-3">{t('settings.taxRatePercent')}</th>
                  <th className="text-left p-3">{t('settings.taxType')}</th>
                  <th className="text-left p-3">{t('settings.applyTaxOn')}</th>
                  <th className="text-left p-3">{t('settings.status')}</th>
                  <th className="text-left p-3 w-28">{t('settings.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {taxes.map((x) => (
                  <tr key={x.id} className="border-t">
                    <td className="p-3 font-medium">{x.name}</td>
                    <td className="p-3">{Math.round((Number(x.rate || 0) * 100) * 100) / 100}%</td>
                    <td className="p-3">{x.type}</td>
                    <td className="p-3 text-xs">
                      {[x.apply?.rooms && t('settings.applyRooms'), x.apply?.bar && t('settings.applyBar'), x.apply?.restaurant && t('settings.applyRestaurant')].filter(Boolean).join(', ') || '-'}
                    </td>
                    <td className="p-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={x.enabled}
                          onChange={(e) => toggleEnabled(x.id, e.target.checked)}
                          disabled={saving}
                        />
                        <span>{t('settings.active')}</span>
                      </label>
                    </td>
                    <td className="p-3 flex gap-2">
                      <button type="button" onClick={() => startEdit(x)} className="text-teal-600 hover:underline text-sm" disabled={saving}>{t('common.edit')}</button>
                      <button type="button" onClick={() => deleteTax(x.id)} className="text-red-600 hover:underline text-sm" disabled={saving}>{t('common.delete')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

