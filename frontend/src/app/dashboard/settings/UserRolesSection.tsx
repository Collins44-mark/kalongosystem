'use client';

/**
 * User & Roles section - MANAGER only.
 * Create users, reset password, disable. Does NOT modify existing UI layout.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { notifyError, notifySuccess, notifyInfo } from '@/store/notifications';
import { useSearch } from '@/store/search';

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
  const searchQuery = useSearch((s) => s.query);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<string>('FRONT_OFFICE');
  const [creating, setCreating] = useState(false);
  const [newUserTempPwd, setNewUserTempPwd] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPwdFor, setResetPwdFor] = useState<UserRow | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');

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

  const q = (searchQuery || '').trim().toLowerCase();
  const displayedUsers = !q
    ? users
    : users.filter((u) => {
        const txt = `${u.name ?? ''} ${u.role} ${u.email} ${u.isDisabled ? 'disabled' : 'active'}`.toLowerCase();
        return txt.includes(q);
      });

  // Auto-refresh list so changes from other devices appear.
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    if (!password.trim() || password.trim().length < 6) {
      notifyError(t('settings.passwordMin'));
      return;
    }
    setCreating(true);
    try {
      const res = await api<{ password: string }>('/users', {
        method: 'POST',
        token,
        body: JSON.stringify({ fullName: fullName.trim(), role, password: password.trim() }),
      });
      setNewUserTempPwd(res.password);
      notifySuccess(`${t('settings.userCreated')} ${t('settings.passwordSet')}: ${res.password}`);
      setFullName('');
      setRole('FRONT_OFFICE');
      setPassword('');
      load();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function resetPassword(id: string) {
    setResettingId(id);
    try {
      const res = await api<{ password: string }>(`/users/${id}/reset-password`, {
        method: 'POST',
        token,
        body: JSON.stringify({ password: resetPasswordValue.trim() }),
      });
      notifyInfo(`${t('settings.passwordSet')}: ${res.password}`);
      load();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setResettingId(null);
    }
  }

  async function toggleDisable(u: UserRow) {
    setOpenMenu(null);
    if (!confirm(u.isDisabled ? t('settings.enableUserConfirm') : t('settings.disableUserConfirm'))) return;
    try {
      await api(`/users/${u.id}/disable`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ disabled: !u.isDisabled }),
      });
      notifySuccess(u.isDisabled ? 'User enabled' : 'User disabled');
      load();
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  function startEdit(u: UserRow) {
    setOpenMenu(null);
    setEditing(u);
    setEditName(u.name || u.email);
    setEditRole(u.role);
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      await api(`/users/${editing.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ fullName: editName.trim(), role: editRole }),
      });
      setEditing(null);
      notifySuccess('User updated');
      load();
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  async function deleteUser(u: UserRow) {
    setOpenMenu(null);
    if (!confirm(t('settings.deleteUserConfirm'))) return;
    try {
      await api(`/users/${u.id}`, { method: 'DELETE', token });
      notifySuccess('User deleted');
      load();
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  const roleLabel = (r: string) => r.replace(/_/g, ' ');

  return (
    <div className="bg-white border rounded p-4 max-w-4xl">
      <h2 className="font-medium mb-2">{t('settings.userRoles')}</h2>
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
                <th className="text-left p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {displayedUsers.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="p-2">{u.name || u.email}</td>
                  <td className="p-2 uppercase">{roleLabel(u.role)}</td>
                  <td className="p-2 text-slate-600 font-mono text-xs">{u.email}</td>
                  <td className="p-2">{u.isDisabled ? t('settings.disabled') : t('settings.active')}</td>
                  <td className="p-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenMenu(openMenu === u.id ? null : u.id)}
                        className="p-1 rounded hover:bg-slate-100"
                        aria-label="Actions"
                      >
                        <svg className="w-4 h-4 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="6" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="18" r="1.5" />
                        </svg>
                      </button>
                      {openMenu === u.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} aria-hidden />
                          <div className="absolute right-0 top-full mt-0.5 py-1 bg-white border rounded-lg shadow-lg z-20 min-w-[140px]">
                            <button onClick={() => startEdit(u)} className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                              {t('common.edit')}
                            </button>
                            <button
                              onClick={() => {
                                setOpenMenu(null);
                                setResetPwdFor(u);
                                setResetPasswordValue('');
                              }}
                              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              {t('settings.resetPassword')}
                            </button>
                            <button onClick={() => toggleDisable(u)} className={`block w-full text-left px-3 py-2 text-sm ${u.isDisabled ? 'text-green-600' : 'text-amber-600'} hover:bg-slate-50`}>
                              {u.isDisabled ? t('settings.enableUser') : t('settings.disableUser')}
                            </button>
                            <button onClick={() => deleteUser(u)} className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50">
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
          {displayedUsers.length === 0 && <p className="text-slate-500 py-4">{t('settings.noUsers')}</p>}
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
                <div>
                  <label className="block text-sm mb-1">{t('settings.password')}</label>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                    placeholder={t('settings.passwordMin')}
                    required
                  />
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

      {resetPwdFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded max-w-sm w-full mx-4">
            <h3 className="font-medium mb-3">{t('settings.resetPassword')}</h3>
            <p className="text-xs text-slate-500 mb-2">{resetPwdFor.email}</p>
            <input
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
              className="w-full px-3 py-2 border rounded mb-3"
              placeholder={t('settings.passwordMin')}
            />
            <div className="flex gap-2">
              <button
                onClick={() => resetPassword(resetPwdFor.id)}
                disabled={!resetPasswordValue.trim() || resetPasswordValue.trim().length < 6 || resettingId === resetPwdFor.id}
                className="flex-1 py-2 bg-teal-600 text-white rounded disabled:opacity-50"
              >
                {resettingId === resetPwdFor.id ? '...' : t('common.save')}
              </button>
              <button onClick={() => setResetPwdFor(null)} className="flex-1 py-2 bg-slate-200 rounded">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded max-w-sm w-full mx-4">
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
                    <option key={r} value={r}>{roleLabel(r)}</option>
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
    </div>
  );
}
