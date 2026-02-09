'use client';

/**
 * Staff Workers - role-based workers (real people under a role).
 * MANAGER only. Create workers, block/unblock, move to another role, view activity.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { notifyError, notifySuccess } from '@/store/notifications';

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
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffWorker | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');

  useEffect(() => {
    if (!token) return;
    const q = roleFilter ? `?role=${roleFilter}` : '';
    api<StaffWorker[]>(`/api/staff-workers${q}`, { token })
      .then(setWorkers)
      .catch(() => setWorkers([]))
      .finally(() => setLoading(false));
  }, [token, roleFilter]);

  async function createWorker(e: React.FormEvent) {
    e.preventDefault();
    if (!newFullName.trim()) return;
    setCreating(true);
    try {
      await api('/api/staff-workers', {
        method: 'POST',
        token,
        body: JSON.stringify({ fullName: newFullName.trim(), role: newRole }),
      });
      notifySuccess('Worker added');
      setNewFullName('');
      setShowCreate(false);
      const q = roleFilter ? `?role=${roleFilter}` : '';
      const list = await api<StaffWorker[]>(`/api/staff-workers${q}`, { token });
      setWorkers(list);
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleBlock(w: StaffWorker) {
    try {
      await api(`/api/staff-workers/${w.id}/block`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ blocked: w.status === 'ACTIVE' }),
      });
      notifySuccess(w.status === 'ACTIVE' ? 'Worker blocked' : 'Worker unblocked');
      setWorkers((prev) =>
        prev.map((x) => (x.id === w.id ? { ...x, status: w.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE' } : x))
      );
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  async function moveRole(w: StaffWorker, newRole: string) {
    try {
      await api(`/api/staff-workers/${w.id}/role`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ role: newRole }),
      });
      notifySuccess('Worker role updated');
      setWorkers((prev) =>
        prev.map((x) => (x.id === w.id ? { ...x, role: newRole } : x))
      );
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  function startEdit(w: StaffWorker) {
    setOpenMenu(null);
    setEditing(w);
    setEditName(w.fullName);
    setEditRole(w.role);
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      await api(`/api/staff-workers/${editing.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ fullName: editName.trim(), role: editRole }),
      });
      setEditing(null);
      notifySuccess('Worker updated');
      const q = roleFilter ? `?role=${roleFilter}` : '';
      const list = await api<StaffWorker[]>(`/api/staff-workers${q}`, { token });
      setWorkers(list);
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  async function deleteWorker(w: StaffWorker) {
    setOpenMenu(null);
    if (!confirm(t('settings.deleteWorkerConfirm'))) return;
    try {
      await api(`/api/staff-workers/${w.id}`, { method: 'DELETE', token });
      notifySuccess('Worker deleted');
      setWorkers((prev) => prev.filter((x) => x.id !== w.id));
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  async function viewActivity(workerId?: string) {
    setActivityLogs(workerId ? { workerId } : {});
    try {
      const q = workerId ? `?workerId=${workerId}` : '';
      const res = await api<unknown[]>(`/api/staff-workers/activity${q}`, { token });
      setLogs(Array.isArray(res) ? res : []);
    } catch {
      setLogs([]);
    }
  }

  return (
    <div className="bg-white border rounded p-4 max-w-3xl">
      <h2 className="font-medium mb-2">{t('settings.staffWorkers')}</h2>

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
                <th className="text-left p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} className="border-b">
                  <td className="p-2">{w.fullName}</td>
                  <td className="p-2">{w.role.replace(/_/g, ' ')}</td>
                  <td className="p-2">{w.status}</td>
                  <td className="p-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenMenu(openMenu === w.id ? null : w.id)}
                        className="p-1 rounded hover:bg-slate-100"
                        aria-label="Actions"
                      >
                        <svg className="w-4 h-4 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="6" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="18" r="1.5" />
                        </svg>
                      </button>
                      {openMenu === w.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} aria-hidden />
                          <div className="absolute right-0 top-full mt-0.5 py-1 bg-white border rounded-lg shadow-lg z-20 min-w-[140px]">
                            <button onClick={() => startEdit(w)} className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                              {t('common.edit')}
                            </button>
                            <button onClick={() => { setOpenMenu(null); toggleBlock(w); }} className={`block w-full text-left px-3 py-2 text-sm ${w.status === 'ACTIVE' ? 'text-amber-600' : 'text-green-600'} hover:bg-slate-50`}>
                              {w.status === 'ACTIVE' ? t('settings.block') : t('settings.unblock')}
                            </button>
                            <button onClick={() => viewActivity(w.id)} className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                              {t('settings.activity')}
                            </button>
                            <button onClick={() => deleteWorker(w)} className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                              {t('common.delete')}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
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

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-4 rounded max-w-sm w-full">
            <h3 className="font-medium mb-3">{t('common.edit')}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">{t('settings.fullName')}</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('settings.role')}</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="w-full px-3 py-2 border rounded">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveEdit} className="px-4 py-2 bg-teal-600 text-white rounded">{t('common.save')}</button>
              <button onClick={() => setEditing(null)} className="px-4 py-2 bg-slate-200 rounded">{t('common.cancel')}</button>
            </div>
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
