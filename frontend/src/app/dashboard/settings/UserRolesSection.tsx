'use client';

/**
 * Roles section - MANAGER only.
 * Create role (name, email, password). Table: Role, Email, Status, Actions.
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
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [password, setPassword] = useState('');
  const [resetPwdFor, setResetPwdFor] = useState<UserRow | null>(null);
  const [resetPwdValue, setResetPwdValue] = useState('');
  const [resetting, setResetting] = useState(false);
  const [editEmailFor, setEditEmailFor] = useState<UserRow | null>(null);
  const [editEmailValue, setEditEmailValue] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

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

  const usedRoles = users.map((u) => u.role);
  const availableRoles = ROLES.filter((r) => !usedRoles.includes(r));

  const roleLabel = (r: string) => r.replace(/_/g, ' ');
  const q = (searchQuery || '').trim().toLowerCase();
  const displayedUsers = !q
    ? users
    : users.filter((u) => {
        const txt = `${u.role} ${u.email} ${u.isDisabled ? 'disabled' : 'active'}`.toLowerCase();
        return txt.includes(q);
      });

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
    if (!email.trim()) {
      notifyError('Email is required');
      return;
    }
    setCreating(true);
    try {
      await api('/users', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: roleLabel(role),
          role,
          email: email.trim().toLowerCase(),
          password: password.trim(),
        }),
      });
      notifySuccess(t('settings.roleCreated'));
      setRole('FRONT_OFFICE');
      setEmail('');
      setPassword('');
      setShowCreate(false);
      load();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetPwdFor || !resetPwdValue.trim() || resetPwdValue.trim().length < 6) {
      notifyError(t('settings.passwordMin'));
      return;
    }
    setResetting(true);
    try {
      await api(`/users/${resetPwdFor.id}/reset-password`, {
        method: 'POST',
        token,
        body: JSON.stringify({ password: resetPwdValue.trim() }),
      });
      notifySuccess(t('settings.passwordResetSuccess'));
      setResetPwdFor(null);
      setResetPwdValue('');
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setResetting(false);
    }
  }

  async function handleEditEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!editEmailFor || !editEmailValue.trim()) {
      notifyError('Email is required');
      return;
    }
    setSavingEmail(true);
    try {
      await api(`/users/${editEmailFor.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ email: editEmailValue.trim().toLowerCase() }),
      });
      notifySuccess(t('settings.emailUpdated'));
      setEditEmailFor(null);
      setEditEmailValue('');
      load();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleToggleDisabled(u: UserRow) {
    try {
      await api(`/users/${u.id}/disable`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ disabled: !u.isDisabled }),
      });
      notifySuccess(u.isDisabled ? t('settings.roleActivated') : t('settings.roleDeactivated'));
      load();
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  return (
    <div className="bg-white border rounded p-4 max-w-4xl">
      <h2 className="font-medium mb-2">{t('settings.roles')}</h2>
      <div className="mb-3">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          disabled={availableRoles.length === 0}
          className="px-4 py-2 bg-teal-600 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('settings.createRole')}
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
                <th className="text-left p-2">{t('settings.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {displayedUsers.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="p-2 uppercase">{roleLabel(u.role)}</td>
                  <td className="p-2 text-slate-600 font-mono text-xs">{u.email}</td>
                  <td className="p-2">{u.isDisabled ? t('settings.disabled') : t('settings.active')}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleDisabled(u)}
                        className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-50"
                      >
                        {u.isDisabled ? t('settings.enableUser') : t('settings.disableUser')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResetPwdFor(u);
                          setResetPwdValue('');
                        }}
                        className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-50"
                      >
                        {t('settings.resetPassword')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditEmailFor(u);
                          setEditEmailValue(u.email);
                        }}
                        className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-50"
                      >
                        {t('settings.editEmail')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {displayedUsers.length === 0 && <p className="text-slate-500 py-4">{t('settings.noRoles')}</p>}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded max-w-sm w-full mx-4">
            <h3 className="font-medium mb-3">{t('settings.createRole')}</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-sm mb-1">{t('settings.role')}</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                >
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="role@example.com"
                  required
                />
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
          </div>
        </div>
      )}

      {resetPwdFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded max-w-sm w-full mx-4">
            <h3 className="font-medium mb-3">{t('settings.resetPassword')} – {roleLabel(resetPwdFor.role)}</h3>
            <form onSubmit={handleResetPassword} className="space-y-3">
              <div>
                <label className="block text-sm mb-1">{t('settings.password')}</label>
                <input
                  type="password"
                  value={resetPwdValue}
                  onChange={(e) => setResetPwdValue(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder={t('settings.passwordMin')}
                  required
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={resetting} className="flex-1 py-2 bg-teal-600 text-white rounded">
                  {resetting ? '...' : t('settings.resetPassword')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetPwdFor(null);
                    setResetPwdValue('');
                  }}
                  className="px-4 py-2 bg-slate-200 rounded"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editEmailFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded max-w-sm w-full mx-4">
            <h3 className="font-medium mb-3">{t('settings.editEmail')} – {roleLabel(editEmailFor.role)}</h3>
            <form onSubmit={handleEditEmail} className="space-y-3">
              <div>
                <label className="block text-sm mb-1">Email</label>
                <input
                  type="email"
                  value={editEmailValue}
                  onChange={(e) => setEditEmailValue(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="role@example.com"
                  required
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={savingEmail} className="flex-1 py-2 bg-teal-600 text-white rounded">
                  {savingEmail ? '...' : t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditEmailFor(null);
                    setEditEmailValue('');
                  }}
                  className="px-4 py-2 bg-slate-200 rounded"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
