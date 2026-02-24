'use client';

import { useEffect, useMemo, useState } from 'react';
import { notifyError, notifySuccess } from '@/store/notifications';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Category = { id: string; name: string };

function errorMessageFromJson(data: any, fallback: string) {
  const msg = data?.message;
  if (Array.isArray(msg)) return msg.join('. ');
  if (typeof msg === 'string' && msg.trim()) return msg;
  return fallback;
}

export function RevenueCategoriesSection({ token, t }: { token: string; t: (k: string) => string }) {
  const [rows, setRows] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const canSubmitNew = useMemo(() => newName.trim().length > 0, [newName]);
  const canSaveEdit = useMemo(() => editingId && editingName.trim().length > 0, [editingId, editingName]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/finance/revenue-categories`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await res.json().catch(() => ([]));
      if (!res.ok) throw new Error(errorMessageFromJson(data, 'Failed to load categories'));
      setRows(Array.isArray(data) ? data.map((r: any) => ({ id: String(r.id), name: String(r.name) })) : []);
    } catch (e) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function addCategory() {
    const name = newName.trim();
    if (!name) return;
    setWorkingId('__new__');
    try {
      const res = await fetch(`${API_URL}/finance/revenue-categories`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorMessageFromJson(data, 'Failed to add category'));
      notifySuccess(t('settings.categoryAdded'));
      setNewName('');
      await load();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setWorkingId(null);
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;
    setWorkingId(editingId);
    try {
      const res = await fetch(`${API_URL}/finance/revenue-categories/${encodeURIComponent(editingId)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorMessageFromJson(data, 'Failed to update category'));
      notifySuccess(t('settings.categoryUpdated'));
      setEditingId(null);
      setEditingName('');
      await load();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setWorkingId(null);
    }
  }

  async function deleteCategory(id: string) {
    setWorkingId(id);
    try {
      const res = await fetch(`${API_URL}/finance/revenue-categories/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorMessageFromJson(data, 'Failed to delete category'));
      notifySuccess(t('settings.categoryDeleted'));
      setConfirmDeleteId(null);
      await load();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="bg-white border rounded-lg p-4 max-w-md">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{t('settings.revenueCategories')}</h2>
        <button
          onClick={() => load()}
          disabled={loading || Boolean(workingId)}
          className="text-xs px-2 py-1 rounded border hover:bg-slate-50 disabled:opacity-60"
          type="button"
        >
          {t('common.refresh')}
        </button>
      </div>

      {loading ? (
        <div className="mt-3 animate-pulse space-y-2">
          <div className="h-10 bg-slate-100 rounded" />
          <div className="h-10 bg-slate-100 rounded" />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 px-3 py-2 border rounded text-sm"
              placeholder={t('settings.addCategoryPlaceholder')}
            />
            <button
              type="button"
              onClick={addCategory}
              disabled={!canSubmitNew || workingId === '__new__'}
              className="px-3 py-2 rounded bg-teal-600 text-white text-sm hover:bg-teal-700 disabled:opacity-60"
            >
              {workingId === '__new__' ? t('common.loading') : t('common.add')}
            </button>
          </div>

          {rows.length === 0 ? (
            <div className="text-sm text-slate-500">{t('settings.noRevenueCategories')}</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <ul className="divide-y">
                {rows.map((c) => {
                  const isEditing = editingId === c.id;
                  const isWorking = workingId === c.id;
                  return (
                    <li key={c.id} className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="w-full px-3 py-2 border rounded text-sm"
                          />
                        ) : (
                          <div className="font-medium text-sm text-slate-900 truncate">{c.name}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={saveEdit}
                              disabled={!canSaveEdit || isWorking}
                              className="px-3 py-1.5 rounded bg-slate-900 text-white text-xs hover:bg-black disabled:opacity-60"
                            >
                              {isWorking ? t('common.loading') : t('common.save')}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingId(null); setEditingName(''); }}
                              disabled={isWorking}
                              className="px-3 py-1.5 rounded bg-slate-200 text-xs hover:bg-slate-300 disabled:opacity-60"
                            >
                              {t('common.cancel')}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => { setEditingId(c.id); setEditingName(c.name); }}
                              disabled={Boolean(workingId)}
                              className="px-3 py-1.5 rounded border text-xs hover:bg-slate-50 disabled:opacity-60"
                            >
                              {t('common.edit')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(c.id)}
                              disabled={Boolean(workingId)}
                              className="px-3 py-1.5 rounded border border-red-400 text-red-700 text-xs hover:bg-red-50 disabled:opacity-60"
                            >
                              {t('common.remove')}
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <p className="text-xs text-slate-500">{t('settings.revenueCategoriesHint')}</p>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-sm p-4 sm:p-5">
            <div className="font-medium text-slate-900">{t('settings.deleteCategoryConfirmTitle')}</div>
            <div className="text-sm text-slate-600 mt-2">{t('settings.deleteCategoryConfirmBody')}</div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => deleteCategory(confirmDeleteId)}
                disabled={workingId === confirmDeleteId}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60"
              >
                {workingId === confirmDeleteId ? t('common.loading') : t('common.confirm')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                disabled={workingId === confirmDeleteId}
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

