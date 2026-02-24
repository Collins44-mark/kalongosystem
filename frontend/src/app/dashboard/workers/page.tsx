'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { useSearch } from '@/store/search';
import { isManagerLevel } from '@/lib/roles';
import { notifyError, notifySuccess } from '@/store/notifications';

type Worker = { id: string; name: string; sector: string; role: string; monthlySalary: string };

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 0 }).format(n);
}

function sectorLabel(sector: string) {
  return String(sector || '').replace(/_/g, ' ').trim() || '-';
}

function normalizeSectorInput(raw: string) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .toUpperCase();
}

export default function WorkersPage() {
  const router = useRouter();
  const { token, user, logout } = useAuth();
  const { t } = useTranslation();
  const searchQuery = useSearch((s) => s.query);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'sector'>('list');
  const [sectorFilter, setSectorFilter] = useState<string>(''); // list view only
  const [sectorSelected, setSectorSelected] = useState<string>(''); // sector summary view only
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addSector, setAddSector] = useState<string>('');
  const [addRole, setAddRole] = useState('');
  const [addSalary, setAddSalary] = useState('');
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<Worker | null>(null);
  const [editName, setEditName] = useState('');
  const [editSector, setEditSector] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editSalary, setEditSalary] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<Worker | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canAdd = isManagerLevel(user?.role);

  function load() {
    if (!token) return;
    setLoading(true);
    api<Worker[]>(`/workers`, { token })
      .then(setWorkers)
      .catch(() => setWorkers([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [token]);

  const q = (searchQuery || '').trim().toLowerCase();
  const sectors = useMemo(() => {
    const set = new Set<string>();
    for (const w of workers) {
      const s = String(w.sector || '').trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => sectorLabel(a).localeCompare(sectorLabel(b)));
  }, [workers]);

  const displayed = useMemo(() => {
    const sectorScope =
      viewMode === 'list'
        ? sectorFilter
        : sectorSelected;

    const scope = String(sectorScope || '').trim();
    const base =
      scope
        ? workers.filter((w) => {
            const ws = String(w.sector || '').trim();
            if (scope === 'UNKNOWN') return !ws;
            return ws === scope;
          })
        : workers;

    if (!q) return base;
    return base.filter((w) => {
      const txt = `${w.name} ${w.sector} ${w.role}`.toLowerCase();
      return txt.includes(q);
    });
  }, [workers, q, viewMode, sectorFilter, sectorSelected]);

  const salaryBySectorAll = useMemo(() => {
    const map = new Map<string, { sector: string; count: number; totalSalary: number }>();
    for (const w of workers) {
      const sector = String(w.sector || '').trim() || 'UNKNOWN';
      const salary = Number(w.monthlySalary) || 0;
      const prev = map.get(sector) ?? { sector, count: 0, totalSalary: 0 };
      prev.count += 1;
      prev.totalSalary += salary;
      map.set(sector, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.totalSalary - a.totalSalary);
  }, [workers]);

  const salaryBySectorAllTotal = useMemo(() => {
    return salaryBySectorAll.reduce((s, x) => s + x.totalSalary, 0) || 0;
  }, [salaryBySectorAll]);

  const activeStats = useMemo(() => {
    const active = displayed;
    const totalWorkers = active.length;
    const totalSalary = active.reduce((s, w) => s + (Number(w.monthlySalary) || 0), 0);
    const avgSalary = totalWorkers > 0 ? totalSalary / totalWorkers : 0;

    const bySector = new Map<string, number>();
    for (const w of active) {
      const s = String(w.sector || '').trim() || 'UNKNOWN';
      bySector.set(s, (bySector.get(s) ?? 0) + (Number(w.monthlySalary) || 0));
    }
    let topSector = '';
    let topSectorSalary = -1;
    for (const [sector, cost] of bySector.entries()) {
      if (cost > topSectorSalary) {
        topSectorSalary = cost;
        topSector = sector;
      }
    }

    return { totalWorkers, totalSalary, avgSalary, topSector, topSectorSalary: Math.max(0, topSectorSalary) };
  }, [displayed]);

  async function handleAddWorker(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !addName.trim()) {
      if (!token) notifyError('Session expired. Please log in again.');
      return;
    }
    const sector = normalizeSectorInput(addSector);
    if (!sector) {
      notifyError(t('common.fillAllFields'));
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
          sector,
          role: addRole.trim() || sectorLabel(sector),
          monthlySalary: salary,
        }),
      });
      notifySuccess(t('workers.workerAdded'));
      setAddName('');
      setAddSector('');
      setAddRole('');
      setAddSalary('');
      setShowAdd(false);
      const list = await api<Worker[]>('/workers', { token });
      setWorkers(list);
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

  function startEdit(w: Worker) {
    setEditing(w);
    setEditName(w.name);
    setEditSector(w.sector);
    setEditRole(w.role);
    setEditSalary(String(Number(w.monthlySalary) || 0));
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !editing) return;
    const name = editName.trim();
    const sector = normalizeSectorInput(editSector);
    const role = editRole.trim();
    const salary = Number(editSalary);
    if (!name || !sector || !role || !Number.isFinite(salary) || salary < 0) {
      notifyError(t('common.fillAllFields'));
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await api<Worker>(`/workers/${encodeURIComponent(editing.id)}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({ name, sector, role, monthlySalary: salary }),
      });
      setWorkers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setEditing(null);
      notifySuccess(t('workers.workerUpdated'));
    } catch (err) {
      const status = (err as Error & { status?: number })?.status;
      notifyError((err as Error)?.message ?? 'Failed to update worker');
      if (status === 401) {
        logout();
        router.replace('/login');
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function doDelete() {
    if (!token || !confirmDelete) return;
    setDeleting(true);
    try {
      await api(`/workers/${encodeURIComponent(confirmDelete.id)}`, { token, method: 'DELETE' });
      setWorkers((prev) => {
        const next = prev.filter((x) => x.id !== confirmDelete.id);
        if (viewMode === 'sector' && sectorSelected) {
          const remainingInSector =
            sectorSelected === 'UNKNOWN'
              ? next.some((w) => !String(w.sector || '').trim())
              : next.some((w) => String(w.sector || '').trim() === sectorSelected.trim());
          if (!remainingInSector) setSectorSelected('');
        }
        return next;
      });
      setConfirmDelete(null);
      notifySuccess(t('workers.workerDeleted'));
    } catch (err) {
      const status = (err as Error & { status?: number })?.status;
      notifyError((err as Error)?.message ?? 'Failed to delete worker');
      if (status === 401) {
        logout();
        router.replace('/login');
      }
    } finally {
      setDeleting(false);
    }
  }

  if (loading && workers.length === 0) return <div>{t('common.loading')}</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-600">{t('workers.totalWorkers')}</div>
          <div className="text-xl font-semibold text-slate-900 mt-1">{activeStats.totalWorkers}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-600">{t('workers.totalMonthlySalaries')}</div>
          <div className="text-xl font-semibold text-slate-900 mt-1">{formatTzs(activeStats.totalSalary)}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-600">{t('workers.highestSectorCost')}</div>
          <div className="text-base font-semibold text-slate-900 mt-1 truncate">
            {activeStats.topSector ? sectorLabel(activeStats.topSector) : '-'}
          </div>
          {activeStats.topSector ? (
            <div className="text-xs text-slate-600 mt-1">{formatTzs(activeStats.topSectorSalary)}</div>
          ) : null}
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-600">{t('workers.averageSalary')}</div>
          <div className="text-xl font-semibold text-slate-900 mt-1">{formatTzs(activeStats.avgSalary)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t('workers.title')}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">{t('workers.viewMode')}</label>
            <div className="inline-flex rounded-lg border bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => { setViewMode('list'); setSectorSelected(''); }}
                className={`px-3 py-2 text-sm ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                {t('workers.listView')}
              </button>
              <button
                type="button"
                onClick={() => { setViewMode('sector'); setSectorFilter(''); }}
                className={`px-3 py-2 text-sm ${viewMode === 'sector' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                {t('workers.bySectorView')}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">{t('workers.filterBySector')}</label>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="px-3 py-2 border rounded text-sm bg-white disabled:opacity-60"
              disabled={viewMode !== 'list'}
            >
              <option value="">{t('workers.allSectors')}</option>
              {sectors.map((s) => (
                <option key={s} value={s}>{sectorLabel(s)}</option>
              ))}
            </select>
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
              <input
                list="workers-sector-options"
                value={addSector}
                onChange={(e) => setAddSector(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm"
                placeholder="e.g. FRONT_OFFICE"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">{t('workers.role')}</label>
              <input
                type="text"
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                placeholder={sectorLabel(normalizeSectorInput(addSector))}
                className="w-full px-3 py-2 border rounded text-sm"
                required
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
          <datalist id="workers-sector-options">
            {sectors.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
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

      {viewMode === 'sector' && !sectorSelected && (
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-slate-900">{t('workers.sectorSummary')}</div>
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              className="text-xs px-2 py-1 rounded border hover:bg-slate-50 disabled:opacity-60"
            >
              {t('common.refresh')}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {salaryBySectorAll.map((row) => {
              const totalAll = salaryBySectorAllTotal;
              const pct = totalAll > 0 ? (row.totalSalary / totalAll) * 100 : 0;
              return (
                <button
                  type="button"
                  key={row.sector}
                  onClick={() => setSectorSelected(row.sector)}
                  className="text-left border rounded-lg p-4 hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-slate-900 truncate">{sectorLabel(row.sector)}</div>
                    <div className="text-xs text-slate-600">{pct.toFixed(0)}%</div>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {t('workers.totalWorkers')}: <span className="font-medium text-slate-800">{row.count}</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {t('workers.salaryCost')}: <span className="font-medium text-slate-800">{formatTzs(row.totalSalary)}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {salaryBySectorAll.length === 0 && (
            <div className="text-sm text-slate-500 mt-3">{t('common.noItems')}</div>
          )}
        </div>
      )}

      {(viewMode === 'list' || sectorSelected) && (
        <div className="bg-white border rounded overflow-hidden">
          {viewMode === 'sector' && sectorSelected && (
            <div className="flex items-center justify-between p-3 border-b bg-slate-50">
              <div className="text-sm text-slate-700">
                {t('workers.sector')}: <span className="font-medium text-slate-900">{sectorLabel(sectorSelected)}</span>
              </div>
              <button
                type="button"
                onClick={() => setSectorSelected('')}
                className="text-xs px-2 py-1 rounded border hover:bg-white"
              >
                {t('common.back')}
              </button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-3">{t('workers.name')}</th>
                  <th className="text-left p-3">{t('workers.sector')}</th>
                  <th className="text-left p-3">{t('workers.role')}</th>
                  <th className="text-right p-3">{t('workers.salary')}</th>
                  <th className="text-right p-3">{t('workers.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((w) => (
                  <tr key={w.id} className="border-t">
                    <td className="p-3">{w.name}</td>
                    <td className="p-3">{sectorLabel(w.sector)}</td>
                    <td className="p-3">{w.role}</td>
                    <td className="p-3 text-right">{formatTzs(parseFloat(w.monthlySalary))}</td>
                    <td className="p-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(w)}
                          className="px-3 py-1.5 rounded border text-xs hover:bg-slate-50"
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(w)}
                          className="px-3 py-1.5 rounded border border-red-400 text-red-700 text-xs hover:bg-red-50"
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {displayed.length === 0 && <p className="text-slate-500 p-4">{t('common.noItems')}</p>}
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto overscroll-contain touch-none"
          style={{ overscrollBehavior: 'contain' }}
        >
          <div className="bg-white rounded-lg w-full max-w-md p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-slate-900">{t('workers.editWorker')}</div>
              <button type="button" onClick={() => setEditing(null)} className="text-sm text-slate-500 hover:text-slate-700">
                {t('common.close')}
              </button>
            </div>
            <form onSubmit={saveEdit} className="mt-3 space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">{t('workers.name')}</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" required />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">{t('workers.sector')}</label>
                <input list="workers-sector-options" value={editSector} onChange={(e) => setEditSector(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" required />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">{t('workers.role')}</label>
                <input value={editRole} onChange={(e) => setEditRole(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" required />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">{t('workers.salary')}</label>
                <input type="number" min={0} step={1} value={editSalary} onChange={(e) => setEditSalary(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" required />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={savingEdit} className="flex-1 px-4 py-2 bg-slate-900 text-white rounded hover:bg-black disabled:opacity-60">
                  {savingEdit ? t('common.loading') : t('common.save')}
                </button>
                <button type="button" onClick={() => setEditing(null)} disabled={savingEdit} className="px-4 py-2 bg-slate-200 rounded hover:bg-slate-300 disabled:opacity-60">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto overscroll-contain touch-none"
          style={{ overscrollBehavior: 'contain' }}
        >
          <div className="bg-white rounded-lg w-full max-w-sm p-4 sm:p-5">
            <div className="font-medium text-slate-900">{t('workers.deleteWorkerConfirmTitle')}</div>
            <div className="text-sm text-slate-600 mt-2">
              {t('workers.deleteWorkerConfirmBody')}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={doDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? t('common.loading') : t('common.confirm')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="px-4 py-2 bg-slate-200 rounded hover:bg-slate-300 disabled:opacity-60"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
