'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { useSearch } from '@/store/search';
import { isManagerLevel } from '@/lib/roles';
import { notifyError, notifySuccess } from '@/store/notifications';

const SECTORS = ['FRONT_OFFICE', 'BAR', 'RESTAURANT', 'KITCHEN', 'HOUSEKEEPING', 'FINANCE'] as const;

type Worker = { id: string; name: string; sector: string; role: string; monthlySalary: string };

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 0 }).format(n);
}

export default function WorkersPage() {
  const router = useRouter();
  const { token, user, logout } = useAuth();
  const { t } = useTranslation();
  const searchQuery = useSearch((s) => s.query);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectorFilter, setSectorFilter] = useState<string>('');
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addSector, setAddSector] = useState<string>(SECTORS[0]);
  const [addRole, setAddRole] = useState('');
  const [addSalary, setAddSalary] = useState('');
  const [saving, setSaving] = useState(false);

  const canAdd = isManagerLevel(user?.role);

  function load() {
    if (!token) return;
    setLoading(true);
    const q = sectorFilter ? `?sector=${encodeURIComponent(sectorFilter)}` : '';
    api<Worker[]>(`/workers${q}`, { token })
      .then(setWorkers)
      .catch(() => setWorkers([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [token, sectorFilter]);

  const q = (searchQuery || '').trim().toLowerCase();
  const displayed = !q
    ? workers
    : workers.filter((w) => {
        const txt = `${w.name} ${w.sector} ${w.role}`.toLowerCase();
        return txt.includes(q);
      });

  async function handleAddWorker(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !addName.trim()) {
      if (!token) notifyError('Session expired. Please log in again.');
      return;
    }
    const salary = Number(addSalary);
    if (!Number.isFinite(salary) || salary < 0) {
      notifyError(t('common.fillAllFields'));
      return;
    }
    setSaving(true);
    try {
      await api('/workers', {
        token,
        method: 'POST',
        body: JSON.stringify({
          name: addName.trim(),
          sector: addSector,
          role: addRole.trim() || addSector,
          monthlySalary: salary,
        }),
      });
      notifySuccess('Worker added');
      setAddName('');
      setAddRole('');
      setAddSalary('');
      setShowAdd(false);
      load();
    } catch (err) {
      const status = (err as Error & { status?: number })?.status;
      const message = (err as Error)?.message ?? 'Failed to add worker';
      notifyError(message);
      if (status === 401) {
        logout();
        router.replace('/login');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading && workers.length === 0) return <div>{t('common.loading')}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t('workers.title')}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">{t('workers.filterBySector')}</label>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="px-3 py-2 border rounded text-sm bg-white"
            >
              <option value="">{t('workers.allSectors')}</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div className="text-sm text-slate-600">
            {t('workers.totalWorkers')}: <span className="font-medium text-slate-800">{displayed.length}</span>
          </div>
          {canAdd && (
            <button
              type="button"
              onClick={() => setShowAdd(!showAdd)}
              className="px-4 py-2 bg-teal-600 text-white rounded text-sm hover:bg-teal-700"
            >
              {showAdd ? t('common.cancel') : t('workers.addWorker')}
            </button>
          )}
        </div>
      </div>

      {canAdd && showAdd && (
        <form onSubmit={handleAddWorker} className="bg-white border rounded-lg p-4 max-w-xl space-y-3">
          <h2 className="font-medium text-slate-800">{t('workers.addWorker')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">{t('workers.name')}</label>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">{t('workers.sector')}</label>
              <select
                value={addSector}
                onChange={(e) => setAddSector(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm bg-white"
              >
                {SECTORS.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">{t('workers.role')}</label>
              <input
                type="text"
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                placeholder={addSector.replace(/_/g, ' ')}
                className="w-full px-3 py-2 border rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">{t('workers.salary')}</label>
              <input
                type="number"
                min={0}
                step={1}
                value={addSalary}
                onChange={(e) => setAddSalary(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm"
                required
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-teal-600 text-white rounded text-sm hover:bg-teal-700 disabled:opacity-50">
              {saving ? t('common.loading') : t('workers.addWorker')}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 border rounded text-sm hover:bg-slate-50">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-3">{t('workers.name')}</th>
                <th className="text-left p-3">{t('workers.sector')}</th>
                <th className="text-left p-3">{t('workers.role')}</th>
                <th className="text-right p-3">{t('workers.salary')}</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((w) => (
                <tr key={w.id} className="border-t">
                  <td className="p-3">{w.name}</td>
                  <td className="p-3">{w.sector.replace(/_/g, ' ')}</td>
                  <td className="p-3">{w.role}</td>
                  <td className="p-3 text-right">{formatTzs(parseFloat(w.monthlySalary))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {displayed.length === 0 && <p className="text-slate-500 p-4">{t('common.noItems')}</p>}
      </div>
    </div>
  );
}
