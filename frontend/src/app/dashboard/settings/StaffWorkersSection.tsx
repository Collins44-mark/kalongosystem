'use client';

/**
 * Staff Workers - role-based workers (real people under a role).
 * MANAGER only. Create workers, block/unblock, move to another role, view activity.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type StaffWorker = {
  id: string;
  businessId: string;
  role: string;
  fullName: string;
  status: string;
  createdAt: string;
};

const ROLES = ['MANAGER', 'FRONT_OFFICE', 'FINANCE', 'HOUSEKEEPING', 'BAR', 'RESTAURANT', 'KITCHEN'];

export function StaffWorkersSection({ token, t }: { token: string; t: (k: string) => string }) {
  const [workers, setWorkers] = useState<StaffWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState('FRONT_OFFICE');
  const [creating, setCreating] = useState(false);
  const [activityLogs, setActivityLogs] = useState<{ workerId?: string } | null>(null);
  const [logs, setLogs] = useState<unknown[]>([]);

  useEffect(() => {
    if (!token) return;
    const q = roleFilter ? `?role=${roleFilter}` : '';
    api<StaffWorker[]>(`/staff-workers${q}`, { token })
      .then(setWorkers)
      .catch(() => setWorkers([]))
      .finally(() => setLoading(false));
  }, [token, roleFilter]);

  async function createWorker(e: React.FormEvent) {
    e.preventDefault();
    if (!newFullName.trim()) return;
    setCreating(true);
    try {
      await api('/staff-workers', {
        method: 'POST',
        token,
        body: JSON.stringify({ fullName: newFullName.trim(), role: newRole }),
      });
      setNewFullName('');
      setShowCreate(false);
      const q = roleFilter ? `?role=${roleFilter}` : '';
      const list = await api<StaffWorker[]>(`/staff-workers${q}`, { token });
      setWorkers(list);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleBlock(w: StaffWorker) {
    try {
      await api(`/staff-workers/${w.id}/block`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ blocked: w.status === 'ACTIVE' }),
      });
      setWorkers((prev) =>
        prev.map((x) => (x.id === w.id ? { ...x, status: w.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE' } : x))
      );
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function moveRole(w: StaffWorker, newRole: string) {
    try {
      await api(`/staff-workers/${w.id}/role`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ role: newRole }),
      });
      setWorkers((prev) =>
        prev.map((x) => (x.id === w.id ? { ...x, role: newRole } : x))
      );
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function viewActivity(workerId?: string) {
    setActivityLogs(workerId ? { workerId } : {});
    try {
      const q = workerId ? `?workerId=${workerId}` : '';
      const res = await api<unknown[]>(`/staff-workers/activity${q}`, { token });
      setLogs(Array.isArray(res) ? res : []);
    } catch {
      setLogs([]);
    }
  }

  return (
    <div className="bg-white border rounded p-4 max-w-3xl">
      <h2 className="font-medium mb-2">{t('settings.staffWorkers')}</h2>
      <p className="text-xs text-slate-500 mb-3">{t('settings.staffWorkersDesc')}</p>

      <div className="flex flex-wrap gap-2 mb-3">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-2 py-1 border rounded text-sm"
        >
          <option value="">{t('settings.allRoles')}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1 bg-teal-600 text-white rounded text-sm"
        >
          {t('settings.addStaffWorker')}
        </button>
        <button
          onClick={() => viewActivity()}
          className="px-3 py-1 bg-slate-200 rounded text-sm"
        >
          {t('settings.viewActivityLogs')}
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse h-20 bg-slate-100 rounded" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">{t('settings.name')}</th>
                <th className="text-left p-2">{t('settings.role')}</th>
                <th className="text-left p-2">{t('settings.status')}</th>
                <th className="text-left p-2">{t('common.edit')}</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} className="border-b">
                  <td className="p-2">{w.fullName}</td>
                  <td className="p-2">
                    <select
                      value={w.role}
                      onChange={(e) => moveRole(w, e.target.value)}
                      className="px-2 py-0.5 border rounded text-xs"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">{w.status}</td>
                  <td className="p-2 flex gap-1 flex-wrap">
                    <button
                      onClick={() => toggleBlock(w)}
                      className={`px-2 py-0.5 rounded text-xs ${w.status === 'ACTIVE' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}
                    >
                      {w.status === 'ACTIVE' ? t('settings.block') : t('settings.unblock')}
                    </button>
                    <button
                      onClick={() => viewActivity(w.id)}
                      className="px-2 py-0.5 bg-slate-100 rounded text-xs"
                    >
                      {t('settings.activity')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {workers.length === 0 && (
            <p className="text-sm text-slate-500 py-4">{t('settings.noStaffWorkers')}</p>
          )}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-4 rounded max-w-sm w-full">
            <h3 className="font-medium mb-3">{t('settings.addStaffWorker')}</h3>
            <form onSubmit={createWorker} className="space-y-3">
              <div>
                <label className="block text-sm mb-1">{t('settings.fullName')}</label>
                <input
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="John Mtei"
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('settings.role')}</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={creating} className="px-4 py-2 bg-teal-600 text-white rounded">
                  {creating ? '...' : t('common.create')}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-slate-200 rounded">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activityLogs !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-4 rounded max-w-2xl w-full max-h-[80vh] overflow-auto">
            <h3 className="font-medium mb-3">{t('settings.activityLogs')}</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {logs.map((l: any, i) => (
                <div key={l?.id ?? i} className="text-sm py-2 border-b">
                  <span className="font-medium">{l.workerName || l.role || '—'}</span>
                  {' · '}
                  {l.actionType}
                  {l.entityType && ` (${l.entityType})`}
                  <span className="text-slate-500 text-xs ml-2">
                    {l.createdAt ? new Date(l.createdAt).toLocaleString() : ''}
                  </span>
                </div>
              ))}
              {logs.length === 0 && <p className="text-slate-500">{t('settings.noActivityLogs')}</p>}
            </div>
            <button onClick={() => setActivityLogs(null)} className="mt-4 px-4 py-2 bg-slate-200 rounded">
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
