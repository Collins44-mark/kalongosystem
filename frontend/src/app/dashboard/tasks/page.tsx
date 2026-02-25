'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { notifyError, notifySuccess } from '@/store/notifications';

type Period = 'today' | 'week' | 'month' | 'bydate';
type StatusFilter = '' | 'pending' | 'completed' | 'overdue';
type TypeFilter = 'all' | 'announcement' | 'assigned';

type TaskRow = {
  id: string;
  type: 'ANNOUNCEMENT' | 'ASSIGNED';
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  dueDate: string | null;
  status: 'PENDING' | 'COMPLETED' | 'OVERDUE';
  isRead: boolean;
  readAt: string | null;
  targetRole: string | null;
  targetWorkerId: string | null;
  targetWorkerName: string | null;
  targetWorkerRole: string | null;
  isAllStaff: boolean;
  createdByRole: string;
  createdAt: string;
  completedAt: string | null;
  completedByWorkerName: string | null;
  completionNote: string | null;
};

type StaffWorkerRow = { id: string; fullName: string; role: string; status: string };

const ROLES = ['FRONT_OFFICE', 'HOUSEKEEPING', 'BAR', 'RESTAURANT', 'KITCHEN', 'FINANCE', 'MANAGER'];

function toLocalDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function statusPill(s: TaskRow['status']) {
  if (s === 'COMPLETED') return 'bg-emerald-100 text-emerald-700';
  if (s === 'OVERDUE') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
}

function priorityPill(p: TaskRow['priority']) {
  if (p === 'HIGH') return 'bg-rose-100 text-rose-700';
  if (p === 'MEDIUM') return 'bg-amber-100 text-amber-700';
  if (p === 'LOW') return 'bg-slate-100 text-slate-700';
  return 'bg-slate-100 text-slate-600';
}

export default function TasksPage() {
  const { token, user } = useAuth();
  const { t } = useTranslation();

  const isManager = (user?.role || '').toUpperCase() === 'MANAGER' || (user?.role || '').toUpperCase() === 'ADMIN' || (user?.role || '').toUpperCase() === 'OWNER';

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<Period>('today');
  const [dateFrom, setDateFrom] = useState(() => toLocalDate(new Date()));
  const [dateTo, setDateTo] = useState(() => toLocalDate(new Date()));
  const [status, setStatus] = useState<StatusFilter>('');
  const [type, setType] = useState<TypeFilter>('all');

  const [roleFilter, setRoleFilter] = useState('');
  const [workerFilter, setWorkerFilter] = useState('');

  const [workers, setWorkers] = useState<StaffWorkerRow[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);

  const [selected, setSelected] = useState<TaskRow | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [completing, setCompleting] = useState(false);

  // Manager create forms
  const [createTab, setCreateTab] = useState<'announcement' | 'assigned'>('announcement');
  const [annTitle, setAnnTitle] = useState('');
  const [annDesc, setAnnDesc] = useState('');
  const [annSendTo, setAnnSendTo] = useState<'ALL' | 'ROLE' | 'WORKER'>('ROLE');
  const [annRole, setAnnRole] = useState('FRONT_OFFICE');
  const [annWorkerId, setAnnWorkerId] = useState('');
  const [savingAnn, setSavingAnn] = useState(false);

  const [asWorkerId, setAsWorkerId] = useState('');
  const [asTitle, setAsTitle] = useState('');
  const [asDesc, setAsDesc] = useState('');
  const [asPriority, setAsPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [asDueDate, setAsDueDate] = useState<string>('');
  const [savingAssigned, setSavingAssigned] = useState(false);

  const dateRangeLabel = useMemo(() => {
    if (period === 'today') return t('tasks.today');
    if (period === 'week') return t('tasks.thisWeek');
    if (period === 'month') return t('tasks.thisMonth');
    return `${dateFrom} ${t('common.to')} ${dateTo}`;
  }, [period, dateFrom, dateTo, t]);

  function fireTasksUpdated() {
    try {
      window.dispatchEvent(new Event('tasks-updated'));
    } catch {
      /* ignore */
    }
  }

  async function loadTasks() {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('period', period);
    if (period === 'bydate') {
      params.set('from', dateFrom);
      params.set('to', dateTo);
    }
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    if (isManager && roleFilter) params.set('role', roleFilter);
    if (isManager && workerFilter) params.set('workerId', workerFilter);

    try {
      const res = await api<TaskRow[]>(`/tasks?${params}`, { token });
      setTasks(res);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkers() {
    if (!token || !isManager) return;
    setWorkersLoading(true);
    try {
      const res = await api<StaffWorkerRow[]>('/api/staff-workers', { token });
      setWorkers(res.filter((w) => (w.status || '').toUpperCase() === 'ACTIVE'));
    } catch {
      setWorkers([]);
    } finally {
      setWorkersLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, period, dateFrom, dateTo, status, type, roleFilter, workerFilter]);

  useEffect(() => {
    loadWorkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isManager]);

  async function openTask(tk: TaskRow) {
    setSelected(tk);
    setCompletionNote('');
    if (!token) return;
    if (!isManager && !tk.isRead) {
      try {
        await api(`/tasks/${tk.id}/read`, { token, method: 'POST' });
        setTasks((prev) => prev.map((x) => (x.id === tk.id ? { ...x, isRead: true, readAt: new Date().toISOString() } : x)));
        fireTasksUpdated();
      } catch {
        // ignore read errors (e.g. no worker selected)
      }
    }
  }

  async function completeSelected() {
    if (!token || !selected) return;
    setCompleting(true);
    try {
      await api(`/tasks/${selected.id}/complete`, {
        token,
        method: 'POST',
        body: JSON.stringify({ note: completionNote.trim() || undefined }),
      });
      notifySuccess(t('tasks.completedSuccess'));
      setSelected((prev) => (prev ? { ...prev, status: 'COMPLETED', completedAt: new Date().toISOString(), completionNote: completionNote.trim() || null } : prev));
      setTasks((prev) => prev.map((x) => (x.id === selected.id ? { ...x, status: 'COMPLETED', completedAt: new Date().toISOString(), completionNote: completionNote.trim() || null, isRead: true } : x)));
      fireTasksUpdated();
    } catch (e) {
      notifyError((e as Error)?.message ?? 'Failed');
    } finally {
      setCompleting(false);
    }
  }

  async function createAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSavingAnn(true);
    try {
      await api('/tasks/announcement', {
        token,
        method: 'POST',
        body: JSON.stringify({
          title: annTitle.trim(),
          description: annDesc.trim(),
          sendTo: annSendTo,
          targetRole: annSendTo === 'ROLE' ? annRole : undefined,
          targetWorkerId: annSendTo === 'WORKER' ? annWorkerId : undefined,
        }),
      });
      notifySuccess(t('tasks.created'));
      setAnnTitle('');
      setAnnDesc('');
      setAnnWorkerId('');
      loadTasks();
      fireTasksUpdated();
    } catch (e) {
      notifyError((e as Error)?.message ?? 'Failed');
    } finally {
      setSavingAnn(false);
    }
  }

  async function createAssigned(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSavingAssigned(true);
    try {
      await api('/tasks/assigned', {
        token,
        method: 'POST',
        body: JSON.stringify({
          workerId: asWorkerId,
          title: asTitle.trim(),
          description: asDesc.trim(),
          priority: asPriority,
          dueDate: asDueDate ? asDueDate : undefined,
        }),
      });
      notifySuccess(t('tasks.created'));
      setAsTitle('');
      setAsDesc('');
      setAsWorkerId('');
      setAsDueDate('');
      loadTasks();
      fireTasksUpdated();
    } catch (e) {
      notifyError((e as Error)?.message ?? 'Failed');
    } finally {
      setSavingAssigned(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('tasks.title')}</h1>
          <div className="text-sm text-slate-500">{dateRangeLabel}</div>
        </div>
      </div>

      {isManager && (
        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateTab('announcement')}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${createTab === 'announcement' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {t('tasks.announcementTask')}
            </button>
            <button
              type="button"
              onClick={() => setCreateTab('assigned')}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${createTab === 'assigned' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {t('tasks.assignedTask')}
            </button>
          </div>

          {createTab === 'announcement' ? (
            <form onSubmit={createAnnouncement} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-600 mb-1">{t('tasks.titleLabel')}</label>
                <input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" required />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-600 mb-1">{t('tasks.description')}</label>
                <textarea value={annDesc} onChange={(e) => setAnnDesc(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">{t('tasks.sendTo')}</label>
                <select value={annSendTo} onChange={(e) => setAnnSendTo(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                  <option value="ALL">{t('tasks.allStaff')}</option>
                  <option value="ROLE">{t('tasks.role')}</option>
                  <option value="WORKER">{t('tasks.staffMember')}</option>
                </select>
              </div>
              <div>
                {annSendTo === 'ROLE' ? (
                  <>
                    <label className="block text-sm text-slate-600 mb-1">{t('tasks.role')}</label>
                    <select value={annRole} onChange={(e) => setAnnRole(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                      {ROLES.filter((r) => r !== 'MANAGER').map((r) => (
                        <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </>
                ) : annSendTo === 'WORKER' ? (
                  <>
                    <label className="block text-sm text-slate-600 mb-1">{t('tasks.staffMember')}</label>
                    <select value={annWorkerId} onChange={(e) => setAnnWorkerId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" required>
                      <option value="">{workersLoading ? t('common.loading') : t('common.select')}</option>
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>{w.fullName} ({w.role.replace(/_/g, ' ')})</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <div className="text-sm text-slate-500 pt-7">{t('tasks.allStaffHint')}</div>
                )}
              </div>
              <div className="md:col-span-2">
                <button type="submit" disabled={savingAnn} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                  {savingAnn ? t('common.loading') : t('tasks.create')}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={createAssigned} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-600 mb-1">{t('tasks.assignTo')}</label>
                <select value={asWorkerId} onChange={(e) => setAsWorkerId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white" required>
                  <option value="">{workersLoading ? t('common.loading') : t('common.select')}</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>{w.fullName} ({w.role.replace(/_/g, ' ')})</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-600 mb-1">{t('tasks.titleLabel')}</label>
                <input value={asTitle} onChange={(e) => setAsTitle(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" required />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-600 mb-1">{t('tasks.description')}</label>
                <textarea value={asDesc} onChange={(e) => setAsDesc(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">{t('tasks.priority')}</label>
                <select value={asPriority} onChange={(e) => setAsPriority(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                  <option value="LOW">{t('tasks.low')}</option>
                  <option value="MEDIUM">{t('tasks.medium')}</option>
                  <option value="HIGH">{t('tasks.high')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">{t('tasks.dueDate')}</label>
                <input type="date" value={asDueDate} onChange={(e) => setAsDueDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="md:col-span-2">
                <button type="submit" disabled={savingAssigned} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                  {savingAssigned ? t('common.loading') : t('tasks.create')}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-600">{t('tasks.filter')}:</span>
          {(['today', 'week', 'month', 'bydate'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${period === p ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {p === 'today' ? t('tasks.today') : p === 'week' ? t('tasks.thisWeek') : p === 'month' ? t('tasks.thisMonth') : t('tasks.byDate')}
            </button>
          ))}
          {period === 'bydate' && (
            <>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
              <span className="text-slate-400">{t('common.to')}</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
            </>
          )}
          <select value={type} onChange={(e) => setType(e.target.value as any)} className="px-3 py-2 border rounded-lg text-sm bg-white">
            <option value="all">{t('tasks.allTypes')}</option>
            <option value="announcement">{t('tasks.announcementTask')}</option>
            <option value="assigned">{t('tasks.assignedTask')}</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="px-3 py-2 border rounded-lg text-sm bg-white">
            <option value="">{t('tasks.allStatuses')}</option>
            <option value="pending">{t('tasks.pending')}</option>
            <option value="overdue">{t('tasks.overdue')}</option>
            <option value="completed">{t('tasks.completed')}</option>
          </select>

          {isManager && (
            <>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm bg-white">
                <option value="">{t('tasks.allRoles')}</option>
                {ROLES.filter((r) => r !== 'MANAGER').map((r) => (
                  <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <select value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm bg-white">
                <option value="">{t('tasks.allStaff')}</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>{w.fullName} ({w.role.replace(/_/g, ' ')})</option>
                ))}
              </select>
            </>
          )}
        </div>

        {loading ? (
          <div className="text-slate-500 text-sm">{t('common.loading')}</div>
        ) : tasks.length === 0 ? (
          <p className="text-slate-500 text-sm">{t('tasks.noTasks')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tasks.map((tk) => (
              <li key={tk.id} className="py-3">
                <button type="button" onClick={() => openTask(tk)} className="w-full text-left group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {!isManager && !tk.isRead && (
                          <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" aria-label={t('tasks.unread')} />
                        )}
                        <div className="font-medium text-slate-900 truncate">{tk.title}</div>
                      </div>
                      <div className="text-sm text-slate-600 mt-1 line-clamp-2">{tk.description}</div>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500">
                        <span className={`px-2 py-1 rounded-full ${statusPill(tk.status)}`}>{tk.status === 'PENDING' ? t('tasks.pending') : tk.status === 'OVERDUE' ? t('tasks.overdue') : t('tasks.completed')}</span>
                        {tk.type === 'ASSIGNED' && (
                          <span className={`px-2 py-1 rounded-full ${priorityPill(tk.priority)}`}>{tk.priority ? t(`tasks.${tk.priority.toLowerCase()}`) : t('tasks.medium')}</span>
                        )}
                        {tk.dueDate && tk.type === 'ASSIGNED' && (
                          <span>{t('tasks.due')}: {new Date(tk.dueDate).toLocaleDateString()}</span>
                        )}
                        <span>{new Date(tk.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 group-hover:text-slate-600">{t('common.view')}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-lg border overflow-hidden">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate">{selected.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className={`px-2 py-1 rounded-full ${statusPill(selected.status)}`}>{selected.status === 'PENDING' ? t('tasks.pending') : selected.status === 'OVERDUE' ? t('tasks.overdue') : t('tasks.completed')}</span>
                  {selected.type === 'ASSIGNED' && (
                    <span className={`px-2 py-1 rounded-full ${priorityPill(selected.priority)}`}>{selected.priority ? t(`tasks.${selected.priority.toLowerCase()}`) : t('tasks.medium')}</span>
                  )}
                </div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-800 px-2 py-1">
                {t('common.close')}
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-sm text-slate-700 whitespace-pre-wrap">{selected.description}</div>
              {selected.type === 'ASSIGNED' && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">{t('tasks.dueDate')}</div>
                    <div className="text-slate-800">{selected.dueDate ? new Date(selected.dueDate).toLocaleDateString() : t('tasks.noDueDate')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">{t('tasks.priority')}</div>
                    <div className="text-slate-800">{selected.priority ? t(`tasks.${selected.priority.toLowerCase()}`) : '-'}</div>
                  </div>
                </div>
              )}

              {selected.status === 'COMPLETED' && (
                <div className="bg-slate-50 border rounded-lg p-3">
                  <div className="text-xs text-slate-500">{t('tasks.completed')}</div>
                  <div className="text-sm text-slate-700 mt-1">
                    {selected.completedAt ? new Date(selected.completedAt).toLocaleString() : ''}
                    {selected.completedByWorkerName ? ` · ${selected.completedByWorkerName}` : ''}
                  </div>
                  {selected.completionNote && (
                    <div className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{selected.completionNote}</div>
                  )}
                </div>
              )}

              {!isManager && selected.type === 'ASSIGNED' && selected.status !== 'COMPLETED' && (
                <div className="space-y-2">
                  <label className="block text-sm text-slate-600">{t('tasks.completionNote')}</label>
                  <textarea value={completionNote} onChange={(e) => setCompletionNote(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={t('tasks.completionNotePlaceholder')} />
                  <button
                    type="button"
                    disabled={completing}
                    onClick={completeSelected}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {completing ? t('common.loading') : t('tasks.markCompleted')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

