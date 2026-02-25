'use client';

/**
 * Roles section - MANAGER only.
 * Create role (role + password). Email auto-generated. Table: Role, Email, Status, Actions (⋮).
 */
import { useEffect, useRef, useState } from 'react';
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
  const [password, setPassword] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [menuOpen]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || password.trim().length < 6) {
      notifyError(t('settings.passwordMin'));
      return;
    }
    setCreating(true);
    try {
      await api('/users', {
        method: 'POST',
        token,
        body: JSON.stringify({ role, password: password.trim() }),
      });
      notifySuccess(t('settings.roleCreated'));
      setRole('FRONT_OFFICE');
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
      setMenuOpen(null);
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
      setMenuOpen(null);
      load();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleToggleDisabled(u: UserRow) {
    setMenuOpen(null);
    try {
      await api(`/users/${u.id}/disable`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ disabled: !u.isDisabled }),
      });
      notifySuccess(u.isDisabled ? t('settings.roleActivated') : t('settings.roleDeactivated'));
      setMenuOpen(null);
      load();
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-4xl shadow-sm">
      <h2 className="font-semibold text-slate-800 mb-4">{t('settings.roles')}</h2>
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          disabled={availableRoles.length === 0}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {t('settings.createRole')}
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse h-24 bg-slate-100 rounded-lg" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left p-3 font-medium text-slate-700">{t('settings.role')}</th>
                <th className="text-left p-3 font-medium text-slate-700">Email</th>
                <th className="text-left p-3 font-medium text-slate-700">{t('settings.status')}</th>
                <th className="text-right p-3 font-medium text-slate-700 w-14"></th>
              </tr>
            </thead>
            <tbody>
              {displayedUsers.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="p-3 font-medium text-slate-800 uppercase tracking-wide">{roleLabel(u.role)}</td>
                  <td className="p-3 text-slate-600 font-mono text-xs">{u.email}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.isDisabled ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {u.isDisabled ? t('settings.disabled') : t('settings.active')}
                    </span>
                  </td>
                  <td className="p-3 text-right" ref={menuOpen === u.id ? menuRef : undefined}>
                    <div className="relative inline-block">
                      <button
                        type="button"
                        onClick={() => setMenuOpen(menuOpen === u.id ? null : u.id)}
                        className="p-1.5 rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                        aria-label="Actions"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="5" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="19" r="1.5" />
                        </svg>
                      </button>
                      {menuOpen === u.id && (
                        <div className="absolute right-0 top-full mt-1 py-1 w-44 bg-white rounded-lg shadow-lg border border-slate-200 z-10">
                          <button
                            type="button"
                            onClick={() => {
                              handleToggleDisabled(u);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 first:rounded-t-lg"
                          >
                            {u.isDisabled ? t('settings.enableUser') : t('settings.disableUser')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResetPwdFor(u);
                              setResetPwdValue('');
                              setMenuOpen(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          >
                            {t('settings.resetPassword')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditEmailFor(u);
                              setEditEmailValue(u.email);
                              setMenuOpen(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 last:rounded-b-lg"
                          >
                            {t('settings.editEmail')}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {displayedUsers.length === 0 && (
            <p className="text-slate-500 py-8 text-center text-sm">{t('settings.noRoles')}</p>
          )}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-5 rounded-xl max-w-sm w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-slate-800 mb-4">{t('settings.createRole')}</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.role')}</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder={t('settings.passwordMin')}
                  required
                  minLength={6}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {creating ? '...' : t('common.create')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetPwdFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-5 rounded-xl max-w-sm w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-slate-800 mb-4">
              {t('settings.resetPassword')} – {roleLabel(resetPwdFor.role)}
            </h3>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.password')}</label>
                <input
                  type="password"
                  value={resetPwdValue}
                  onChange={(e) => setResetPwdValue(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder={t('settings.passwordMin')}
                  required
                  minLength={6}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={resetting}
                  className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {resetting ? '...' : t('settings.resetPassword')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetPwdFor(null);
                    setResetPwdValue('');
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium"
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
          <div className="bg-white p-5 rounded-xl max-w-sm w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-slate-800 mb-4">
              {t('settings.editEmail')} – {roleLabel(editEmailFor.role)}
            </h3>
            <form onSubmit={handleEditEmail} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={editEmailValue}
                  onChange={(e) => setEditEmailValue(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="role@hms.local"
                  required
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingEmail}
                  className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {savingEmail ? '...' : t('common.save')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditEmailFor(null);
                    setEditEmailValue('');
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium"
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
