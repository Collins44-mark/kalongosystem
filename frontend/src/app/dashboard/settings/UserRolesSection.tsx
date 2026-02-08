'use client';

/**
 * User & Roles section - MANAGER only.
 * Create users, reset password, disable. Does NOT modify existing UI layout.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type UserRow = {
  id: string;
  userId: string;
  name: string | null;
  role: string;
  email: string;
  isDisabled: boolean;
  createdAt: string;
};

const ROLES = ['MANAGER', 'FRONT_OFFICE', 'FINANCE', 'HOUSEKEEPING', 'BAR', 'RESTAURANT', 'KITCHEN'] as const;

export function UserRolesSection({ token, t }: { token: string; t: (k: string) => string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<string>('FRONT_OFFICE');
  const [creating, setCreating] = useState(false);
  const [newUserTempPwd, setNewUserTempPwd] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  function load() {
    if (!token) return;
    api<UserRow[]>('/users', { token })
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [token]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    setCreating(true);
    try {
      const res = await api<{ temporaryPassword: string }>('/users', {
        method: 'POST',
        token,
        body: JSON.stringify({ fullName: fullName.trim(), role }),
      });
      setNewUserTempPwd(res.temporaryPassword);
      setFullName('');
      setRole('FRONT_OFFICE');
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function resetPassword(id: string) {
    setResettingId(id);
    try {
      const res = await api<{ temporaryPassword: string }>(`/users/${id}/reset-password`, {
        method: 'POST',
        token,
      });
      alert(`${t('settings.tempPassword')}: ${res.temporaryPassword}\n\n${t('settings.copyPassword')}`);
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setResettingId(null);
    }
  }

  async function toggleDisable(u: UserRow) {
    if (!confirm(u.isDisabled ? t('settings.enableUserConfirm') : t('settings.disableUserConfirm'))) return;
    try {
      await api(`/users/${u.id}/disable`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ disabled: !u.isDisabled }),
      });
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const roleLabel = (r: string) => r.replace(/_/g, ' ');

  return (
    <div className="bg-white border rounded p-4 max-w-4xl">
      <h2 className="font-medium mb-2">{t('settings.userRoles')}</h2>
      <p className="text-sm text-slate-600 mb-3">{t('settings.userRolesDesc')}</p>
      <div className="mb-3">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-teal-600 text-white rounded text-sm"
        >
          {t('settings.createUser')}
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse h-24 bg-slate-100 rounded" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">{t('settings.name')}</th>
                <th className="text-left p-2">{t('settings.role')}</th>
                <th className="text-left p-2">Email</th>
                <th className="text-left p-2">{t('settings.status')}</th>
                <th className="text-left p-2">{t('settings.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="p-2">{u.name || u.email}</td>
                  <td className="p-2 uppercase">{roleLabel(u.role)}</td>
                  <td className="p-2 text-slate-600 font-mono text-xs">{u.email}</td>
                  <td className="p-2">{u.isDisabled ? t('settings.disabled') : t('settings.active')}</td>
                  <td className="p-2 flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => resetPassword(u.id)}
                      disabled={resettingId === u.id}
                      className="px-2 py-1 text-teal-600 hover:underline text-xs"
                    >
                      {resettingId === u.id ? '...' : t('settings.resetPassword')}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleDisable(u)}
                      className={`px-2 py-1 text-xs ${u.isDisabled ? 'text-green-600' : 'text-amber-600'} hover:underline`}
                    >
                      {u.isDisabled ? t('settings.enableUser') : t('settings.disableUser')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <p className="text-slate-500 py-4">{t('settings.noUsers')}</p>}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded max-w-sm w-full mx-4">
            <h3 className="font-medium mb-3">{t('settings.createUser')}</h3>
            {newUserTempPwd ? (
              <div className="space-y-2">
                <p className="text-sm text-green-600">{t('settings.userCreated')}</p>
                <p className="text-sm font-mono bg-slate-100 p-2 rounded">{newUserTempPwd}</p>
                <p className="text-xs text-slate-500">{t('settings.copyPassword')}</p>
                <button
                  type="button"
                  onClick={() => {
                    setNewUserTempPwd(null);
                    setShowCreate(false);
                  }}
                  className="w-full py-2 bg-teal-600 text-white rounded"
                >
                  {t('common.close')}
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <label className="block text-sm mb-1">{t('settings.fullName')}</label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">{t('settings.role')}</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{roleLabel(r)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={creating} className="flex-1 py-2 bg-teal-600 text-white rounded">
                    {creating ? '...' : t('common.create')}
                  </button>
                  <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-slate-200 rounded">
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
