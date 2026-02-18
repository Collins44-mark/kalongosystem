'use client';

/**
 * Roles section - MANAGER only.
 * Create user (role + password). Table: Role, Email, Status.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { notifyError, notifySuccess } from '@/store/notifications';
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
  const [role, setRole] = useState<string>('FRONT_OFFICE');
  const [creating, setCreating] = useState(false);
  const [newUserTempPwd, setNewUserTempPwd] = useState<string | null>(null);
  const [password, setPassword] = useState('');

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

  const roleLabel = (r: string) => r.replace(/_/g, ' ');
  const q = (searchQuery || '').trim().toLowerCase();
  const displayedUsers = !q
    ? users
    : users.filter((u) => {
        const txt = `${u.role} ${u.email} ${u.isDisabled ? 'disabled' : 'active'}`.toLowerCase();
        return txt.includes(q);
      });

  // Refresh list when user returns to tab (no constant polling).
  useEffect(() => {
    if (!token) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [token]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || password.trim().length < 6) {
      notifyError(t('settings.passwordMin'));
      return;
    }
    setCreating(true);
    try {
      const res = await api<{ password: string }>('/users', {
        method: 'POST',
        token,
        body: JSON.stringify({ fullName: roleLabel(role), role, password: password.trim() }),
      });
      setNewUserTempPwd(res.password);
      notifySuccess(`${t('settings.userCreated')} ${t('settings.passwordSet')}: ${res.password}`);
      setRole('FRONT_OFFICE');
      setPassword('');
      load();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="bg-white border rounded p-4 max-w-4xl">
      <h2 className="font-medium mb-2">{t('settings.roles')}</h2>
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
                <th className="text-left p-2">{t('settings.role')}</th>
                <th className="text-left p-2">Email</th>
                <th className="text-left p-2">{t('settings.status')}</th>
              </tr>
            </thead>
            <tbody>
              {displayedUsers.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="p-2 uppercase">{roleLabel(u.role)}</td>
                  <td className="p-2 text-slate-600 font-mono text-xs">{u.email}</td>
                  <td className="p-2">{u.isDisabled ? t('settings.disabled') : t('settings.active')}</td>
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
                    type="password"
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

    </div>
  );
}
