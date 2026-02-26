'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { useSearch } from '@/store/search';
import { notifyError, notifySuccess } from '@/store/notifications';
import { isManagerLevel } from '@/lib/roles';

type StaffWorker = { id: string; fullName: string };
type Room = {
  id: string;
  roomNumber: string;
  status: string;
  category: { name: string };
  cleaningLogs?: CleaningLog[];
  cleaningAssignedToWorker?: StaffWorker | null;
  cleaningAssignedByWorker?: StaffWorker | null;
  cleaningAssignedAt?: string | null;
  cleaningStatus?: string | null;
};
type CleaningLog = { id: string; roomId: string; cleanedByWorkerName: string | null; assignedStaffName?: string | null; createdAt: string; room?: { roomNumber: string } };
type MaintenanceRequest = { id: string; roomId: string | null; description: string; type: string; status: string; createdAt: string };
type LaundryRequest = {
  id: string;
  roomNumber: string | null;
  item: string;
  quantity: number;
  status: string;
  createdAt: string;
  deliveredAt: string | null;
  createdByWorkerName?: string | null;
  assignedToWorker?: StaffWorker | null;
  assignedByWorker?: StaffWorker | null;
  assignedAt?: string | null;
};

function roomBorderClass(status: string): string {
  if (status === 'OCCUPIED') return 'border-green-200 bg-green-50';
  if (status === 'RESERVED') return 'border-amber-200 bg-amber-50';
  if (status === 'UNDER_MAINTENANCE') return 'border-red-200 bg-red-50';
  return 'border-slate-300 bg-slate-100';
}

const SECTION_CLASS = 'bg-white border border-slate-200 rounded-lg overflow-hidden';
const SECTION_HEADER = 'font-medium p-4 border-b border-slate-100';
const CARD_PADDING = 'p-4';

type MaintFilter = 'all' | 'pending' | 'in_progress' | 'resolved' | 'by_room' | 'by_date';
type MaintDateFilter = 'today' | 'week' | 'month';
type HistoryType = 'cleaning' | 'laundry' | 'all';
type HistoryFilter = 'today' | 'week' | 'month' | 'by_room' | 'by_staff';

export default function HousekeepingPage() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const searchQuery = useSearch((s) => s.query);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [cleaningLogs, setCleaningLogs] = useState<CleaningLog[]>([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [laundryRequests, setLaundryRequests] = useState<LaundryRequest[]>([]);
  const [staffWorkers, setStaffWorkers] = useState<StaffWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [statusSaving, setStatusSaving] = useState<string | null>(null);
  const [showReportIssue, setShowReportIssue] = useState(false);
  const [showLaundry, setShowLaundry] = useState(false);
  const [showAssignCleaning, setShowAssignCleaning] = useState(false);
  const [showAssignLaundry, setShowAssignLaundry] = useState(false);
  const [assignLaundryId, setAssignLaundryId] = useState<string | null>(null);
  const [assignWorkerId, setAssignWorkerId] = useState('');
  const [reportDesc, setReportDesc] = useState('');
  const [reportPriority, setReportPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [laundryRoom, setLaundryRoom] = useState('');
  const [laundryItem, setLaundryItem] = useState('');
  const [laundryQty, setLaundryQty] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [maintFilter, setMaintFilter] = useState<MaintFilter>('all');
  const [maintRoomFilter, setMaintRoomFilter] = useState('');
  const [maintDateFilter, setMaintDateFilter] = useState<MaintDateFilter>('today');
  const [historyType, setHistoryType] = useState<HistoryType>('cleaning');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('today');
  const [historyRoomFilter, setHistoryRoomFilter] = useState('');
  const [historyStaffFilter, setHistoryStaffFilter] = useState('');
  const [expandedMaintId, setExpandedMaintId] = useState<string | null>(null);
  const isAdmin = isManagerLevel(user?.role);

  const DESCR_MAX = 80;
  const isLongDesc = (s: string) => (s?.length ?? 0) > DESCR_MAX;

  function refresh() {
    if (!token) return;
    Promise.allSettled([
      api<Room[]>('/housekeeping/rooms', { token }),
      api<CleaningLog[]>('/housekeeping/cleaning-logs', { token }),
      api<MaintenanceRequest[]>('/housekeeping/requests', { token }),
      api<LaundryRequest[]>('/housekeeping/laundry', { token }),
      api<StaffWorker[]>('/housekeeping/assignable-staff', { token }),
    ]).then(([roomsRes, logsRes, maintRes, laundryRes, staffRes]) => {
      const r = roomsRes.status === 'fulfilled' && Array.isArray(roomsRes.value) ? roomsRes.value : [];
      const c = logsRes.status === 'fulfilled' && Array.isArray(logsRes.value) ? logsRes.value : [];
      const m = maintRes.status === 'fulfilled' && Array.isArray(maintRes.value) ? maintRes.value : [];
      const l = laundryRes.status === 'fulfilled' && Array.isArray(laundryRes.value) ? laundryRes.value : [];
      const s = staffRes.status === 'fulfilled' && Array.isArray(staffRes.value) ? staffRes.value : [];
      setRooms(r);
      setCleaningLogs(c);
      setMaintenanceRequests(m);
      setLaundryRequests(l);
      setStaffWorkers(s);
      setSelectedRoom((prev) => (prev ? r.find((x) => x.id === prev.id) ?? null : null));
      if (roomsRes.status === 'rejected') {
        notifyError(roomsRes.reason instanceof Error ? roomsRes.reason.message : 'Failed to load rooms');
      }
    }).finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    refresh();
  }, [token]);

  async function markAsCleaned(roomId: string) {
    if (!token) return;
    setMarkingId(roomId);
    try {
      await api(`/housekeeping/rooms/${roomId}/cleaning-status`, { method: 'PUT', token, body: JSON.stringify({ status: 'COMPLETED' }) });
      notifySuccess(t('housekeeping.markAsCleaned'));
      refresh();
      if (selectedRoom?.id === roomId) setSelectedRoom(null);
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setMarkingId(null);
    }
  }

  async function updateCleaningStatus(roomId: string, status: string) {
    if (!token) return;
    setMarkingId(roomId);
    try {
      await api(`/housekeeping/rooms/${roomId}/cleaning-status`, { method: 'PUT', token, body: JSON.stringify({ status }) });
      notifySuccess(t('housekeeping.statusUpdated'));
      refresh();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setMarkingId(null);
    }
  }

  async function updateLaundryStatus(id: string, status: string) {
    if (!token) return;
    try {
      await api(`/housekeeping/laundry/${id}/status`, { method: 'PUT', token, body: JSON.stringify({ status }) });
      notifySuccess(t('housekeeping.statusUpdated'));
      refresh();
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  async function setRoomStatus(roomId: string, status: string) {
    if (!token) return;
    setStatusSaving(roomId);
    try {
      await api(`/housekeeping/rooms/${roomId}/status`, { method: 'PUT', token, body: JSON.stringify({ status }) });
      notifySuccess(t('housekeeping.statusUpdated'));
      refresh();
      if (selectedRoom?.id === roomId) setSelectedRoom(null);
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setStatusSaving(null);
    }
  }

  function handleStatusChange(roomId: string, newStatus: string) {
    setRoomStatus(roomId, newStatus);
  }

  async function submitReport() {
    if (!token || !reportDesc.trim()) return;
    setSubmitting(true);
    try {
      const desc = `[${reportPriority}] ${reportDesc.trim()}`;
      await api('/housekeeping/requests', {
        method: 'POST',
        token,
        body: JSON.stringify({ description: desc, type: 'MAINTENANCE', roomId: selectedRoom?.id ?? undefined }),
      });
      notifySuccess(t('housekeeping.reportIssue'));
      setShowReportIssue(false);
      setReportDesc('');
      setReportPriority('MEDIUM');
      refresh();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function createLaundryRequest() {
    if (!token || !laundryItem.trim()) return;
    setSubmitting(true);
    try {
      await api('/housekeeping/laundry', {
        method: 'POST',
        token,
        body: JSON.stringify({ roomNumber: laundryRoom.trim() || undefined, item: laundryItem.trim(), quantity: parseInt(laundryQty, 10) || 1 }),
      });
      notifySuccess(t('housekeeping.requestLinen'));
      setShowLaundry(false);
      setLaundryRoom('');
      setLaundryItem('');
      setLaundryQty('1');
      refresh();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function markLaundryDelivered(id: string) {
    if (!token || !isAdmin) return;
    try {
      await api(`/housekeeping/laundry/${id}/delivered`, { method: 'POST', token });
      notifySuccess(t('housekeeping.markDelivered'));
      refresh();
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  async function assignCleaning(roomId: string) {
    if (!token || !assignWorkerId) return;
    setSubmitting(true);
    try {
      await api(`/housekeeping/rooms/${roomId}/assign-cleaning`, { method: 'PUT', token, body: JSON.stringify({ workerId: assignWorkerId }) });
      notifySuccess(t('housekeeping.assigned'));
      setShowAssignCleaning(false);
      setAssignWorkerId('');
      refresh();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function assignLaundry(reqId: string) {
    if (!token || !assignWorkerId) return;
    setSubmitting(true);
    try {
      await api(`/housekeeping/laundry/${reqId}/assign`, { method: 'PUT', token, body: JSON.stringify({ workerId: assignWorkerId }) });
      notifySuccess(t('housekeeping.assigned'));
      setShowAssignLaundry(false);
      setAssignLaundryId(null);
      setAssignWorkerId('');
      refresh();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function updateMaintenanceStatus(id: string, status: string) {
    if (!token || !isAdmin) return;
    try {
      if (status === 'APPROVED') {
        await api(`/housekeeping/requests/${id}/approve`, { method: 'POST', token });
      } else if (status === 'REJECTED') {
        await api(`/housekeeping/requests/${id}/reject`, { method: 'POST', token });
      } else {
        await api(`/housekeeping/requests/${id}/status`, { method: 'PUT', token, body: JSON.stringify({ status }) });
      }
      notifySuccess(t('housekeeping.statusUpdated'));
      refresh();
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  if (loading) return <div>{t('common.loading')}</div>;

  const q = (searchQuery || '').trim().toLowerCase();
  const displayedRooms = !q ? rooms : rooms.filter((r) => `${r.roomNumber} ${r.status} ${r.category?.name ?? ''}`.toLowerCase().includes(q));
  const needsCleaning = rooms.filter((r) => r.status === 'UNDER_MAINTENANCE');
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const cleanedTodayCount = cleaningLogs.filter((l) => new Date(l.createdAt) >= todayStart).length;

  const statusLabel = (s: string) => {
    if (s === 'OCCUPIED') return t('overview.occupied');
    if (s === 'VACANT') return t('overview.vacant');
    if (s === 'RESERVED') return t('overview.reserved');
    return t('overview.underMaintenance');
  };

  const maintenanceStatusLabel = (s: string) => {
    if (s === 'PENDING') return t('housekeeping.pending');
    if (s === 'IN_PROGRESS') return t('housekeeping.inProgress');
    if (s === 'APPROVED') return t('housekeeping.resolved');
    if (s === 'REJECTED') return t('housekeeping.rejected');
    return s;
  };

  const cleaningStatusLabel = (s: string) => {
    if (s === 'ASSIGNED') return t('housekeeping.assigned');
    if (s === 'IN_PROGRESS') return t('housekeeping.inProgress');
    if (s === 'COMPLETED') return t('housekeeping.completed');
    return s;
  };

  const laundryStatusLabel = (s: string) => {
    if (s === 'REQUESTED') return t('housekeeping.requested');
    if (s === 'ASSIGNED') return t('housekeeping.assigned');
    if (s === 'IN_PROGRESS') return t('housekeeping.inProgress');
    if (s === 'COMPLETED') return t('housekeeping.completed');
    if (s === 'APPROVED') return t('housekeeping.approved');
    if (s === 'DELIVERED') return t('housekeeping.delivered');
    return s;
  };

  const roomCleaningLogsFor = (roomId: string) => cleaningLogs.filter((l) => l.roomId === roomId);

  // Filter maintenance requests
  const filteredMaintenance = maintenanceRequests.filter((req) => {
    if (maintFilter === 'all') return true;
    if (maintFilter === 'pending') return req.status === 'PENDING';
    if (maintFilter === 'in_progress') return req.status === 'IN_PROGRESS';
    if (maintFilter === 'resolved') return req.status === 'APPROVED' || req.status === 'REJECTED';
    if (maintFilter === 'by_room') {
      if (!maintRoomFilter) return true;
      const room = rooms.find((r) => r.id === req.roomId);
      return room?.roomNumber === maintRoomFilter;
    }
    if (maintFilter === 'by_date') {
      const d = new Date(req.createdAt);
      const now = new Date();
      if (maintDateFilter === 'today') return d >= todayStart;
      if (maintDateFilter === 'week') {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - 7);
        return d >= weekStart;
      }
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return d >= monthStart;
    }
    return true;
  });

  // Filter history
  const filterHistoryByDate = (dateStr: string, filter: HistoryFilter) => {
    const d = new Date(dateStr);
    const now = new Date();
    if (filter === 'today') return d >= todayStart;
    if (filter === 'week') {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - 7);
      return d >= weekStart;
    }
    if (filter === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return d >= monthStart;
    }
    return true;
  };

  const filteredCleaningLogs = cleaningLogs.filter((l) => {
    if (!filterHistoryByDate(l.createdAt, historyFilter)) return false;
    if (historyFilter === 'by_room' && historyRoomFilter) return l.room?.roomNumber === historyRoomFilter;
    if (historyFilter === 'by_staff' && historyStaffFilter) return (l.cleanedByWorkerName ?? '').toLowerCase().includes(historyStaffFilter.toLowerCase());
    return true;
  });

  const filteredLaundryRequests = laundryRequests.filter((l) => {
    if (!filterHistoryByDate(l.createdAt, historyFilter)) return false;
    if (historyFilter === 'by_room' && historyRoomFilter) return l.roomNumber === historyRoomFilter;
    if (historyFilter === 'by_staff' && historyStaffFilter) {
      const staff = ((l.assignedToWorker?.fullName ?? '') + (l.createdByWorkerName ?? '')).toLowerCase();
      return staff.includes(historyStaffFilter.toLowerCase());
    }
    return true;
  });


  return (
    <div className="max-w-6xl mx-auto space-y-4 md:space-y-6 px-2 md:px-0">
      <h1 className="text-lg md:text-xl font-semibold break-words">{t('housekeeping.title')}</h1>

      {/* 1) Summary Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-4">
        <div className={`p-3 md:p-4 rounded-lg border min-w-0 ${roomBorderClass('VACANT')}`}>
          <div className="text-xs text-slate-600 truncate">{t('overview.totalRooms')}</div>
          <div className="text-lg md:text-xl font-semibold">{rooms.length}</div>
        </div>
        <div className={`p-3 md:p-4 rounded-lg border min-w-0 ${roomBorderClass('OCCUPIED')}`}>
          <div className="text-xs text-slate-600 truncate">{t('overview.occupied')}</div>
          <div className="text-lg md:text-xl font-semibold">{rooms.filter((r) => r.status === 'OCCUPIED').length}</div>
        </div>
        <div className={`p-3 md:p-4 rounded-lg border min-w-0 ${roomBorderClass('VACANT')}`}>
          <div className="text-xs text-slate-600 truncate">{t('overview.vacant')}</div>
          <div className="text-lg md:text-xl font-semibold">{rooms.filter((r) => r.status === 'VACANT').length}</div>
        </div>
        <div className={`p-3 md:p-4 rounded-lg border min-w-0 ${roomBorderClass('RESERVED')}`}>
          <div className="text-xs text-slate-600 truncate">{t('overview.reserved')}</div>
          <div className="text-lg md:text-xl font-semibold">{rooms.filter((r) => r.status === 'RESERVED').length}</div>
        </div>
        <div className={`p-3 md:p-4 rounded-lg border min-w-0 ${roomBorderClass('UNDER_MAINTENANCE')}`}>
          <div className="text-xs text-slate-600 truncate">{t('overview.underMaintenance')}</div>
          <div className="text-lg md:text-xl font-semibold">{needsCleaning.length}</div>
        </div>
        <div className="p-3 md:p-4 rounded-lg border border-slate-300 bg-slate-50 min-w-0 col-span-2 md:col-span-1">
          <div className="text-xs text-slate-600 truncate">{t('housekeeping.cleanedToday')}</div>
          <div className="text-lg md:text-xl font-semibold">{cleanedTodayCount}</div>
        </div>
      </div>

      {/* 2) Rooms Grid Section */}
      <div className={SECTION_CLASS}>
        <h2 className="font-medium p-3 md:p-4 border-b border-slate-100 text-base md:text-inherit">{t('overview.rooms')}</h2>
        <div className="p-3 md:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            {displayedRooms.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRoom(selectedRoom?.id === r.id ? null : r)}
                className={`p-3 md:p-4 rounded-lg border min-h-[72px] md:min-h-[80px] flex flex-col justify-between text-left w-full ${roomBorderClass(r.status)} ${
                  selectedRoom?.id === r.id ? 'ring-2 ring-teal-400' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.roomNumber}</div>
                  <div className="text-xs text-slate-600 truncate">{r.category?.name ?? '-'}</div>
                </div>
                <div className="text-xs text-slate-500 mt-1 break-words">{statusLabel(r.status)}</div>
              </button>
            ))}
          </div>
          {displayedRooms.length === 0 && <p className="text-slate-500 text-sm py-4">{t('common.noItems')}</p>}
        </div>
      </div>

      {/* Room Details Panel + Request Linen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {selectedRoom ? (
          <div className={`w-full md:col-span-2 ${SECTION_CLASS}`}>
            <h3 className="font-medium p-3 md:p-4 border-b border-slate-100 text-sm md:text-base break-words">{selectedRoom.roomNumber} — {statusLabel(selectedRoom.status)}</h3>
            <div className="p-3 md:p-4 space-y-3">
              <div className="text-sm text-slate-600 mb-3">{selectedRoom.category?.name}</div>
              {selectedRoom.cleaningAssignedToWorker && (
                <div className="mb-3 text-sm">
                  <span className="text-slate-500 text-xs">{t('housekeeping.assignedTo')}: </span>
                  <span>{selectedRoom.cleaningAssignedToWorker.fullName}</span>
                  {selectedRoom.cleaningStatus && (
                    <span className="ml-2 text-xs text-slate-500">({cleaningStatusLabel(selectedRoom.cleaningStatus)})</span>
                  )}
                </div>
              )}
              {(() => {
                const roomLogs = roomCleaningLogsFor(selectedRoom.id);
                const lastLog = roomLogs[0];
                return lastLog ? (
                  <div className="mb-4 text-sm">
                    <div className="text-slate-500 text-xs">{t('housekeeping.lastCleanedBy')}</div>
                    <div>{lastLog.cleanedByWorkerName ?? '-'}</div>
                    <div className="text-slate-500 text-xs">{new Date(lastLog.createdAt).toLocaleString()}</div>
                  </div>
                ) : null;
              })()}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => { setShowAssignCleaning(true); setAssignWorkerId(selectedRoom.cleaningAssignedToWorker?.id ?? ''); }}
                  className="w-full px-3 py-2 md:py-2 border border-slate-300 rounded text-sm hover:bg-slate-50 min-h-[40px]"
                >
                  {t('housekeeping.assignCleaning')}
                </button>
                {selectedRoom.status === 'UNDER_MAINTENANCE' && selectedRoom.cleaningStatus === 'ASSIGNED' && (
                  <button
                    type="button"
                    onClick={() => updateCleaningStatus(selectedRoom.id, 'IN_PROGRESS')}
                    disabled={!!markingId}
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50 min-h-[40px] disabled:opacity-50"
                  >
                    {markingId === selectedRoom.id ? '...' : t('housekeeping.setToInProgress')}
                  </button>
                )}
                {selectedRoom.status === 'UNDER_MAINTENANCE' && (
                  <button
                    type="button"
                    onClick={() => markAsCleaned(selectedRoom.id)}
                    disabled={!!markingId}
                    className="w-full px-3 py-2 bg-teal-600 text-white rounded text-sm disabled:opacity-50 min-h-[40px]"
                  >
                    {markingId === selectedRoom.id ? '...' : t('housekeeping.markAsCleaned')}
                  </button>
                )}
                {isAdmin ? (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('housekeeping.status')}</label>
                    <select
                      value={selectedRoom.status}
                      onChange={(e) => handleStatusChange(selectedRoom.id, e.target.value)}
                      disabled={!!statusSaving}
                      className="w-full px-3 py-2 border rounded text-sm min-h-[40px]"
                    >
                      <option value="VACANT">{t('overview.vacant')}</option>
                      <option value="OCCUPIED">{t('overview.occupied')}</option>
                      <option value="RESERVED">{t('overview.reserved')}</option>
                      <option value="UNDER_MAINTENANCE">{t('overview.underMaintenance')}</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('housekeeping.status')}</label>
                    <select value={selectedRoom.status} disabled className="w-full px-3 py-2 border rounded text-sm bg-slate-50 opacity-75 cursor-not-allowed">
                      <option value={selectedRoom.status}>{statusLabel(selectedRoom.status)}</option>
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowReportIssue(true)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50 min-h-[40px]"
                >
                  {t('housekeeping.reportIssue')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={`md:col-span-2 ${SECTION_CLASS}`}>
            <div className={CARD_PADDING}>
              <p className="text-slate-500 text-sm">{t('housekeeping.selectRoomHint')}</p>
            </div>
          </div>
        )}
        <div className={`w-full ${SECTION_CLASS}`}>
          <h3 className="font-medium p-3 md:p-4 border-b border-slate-100">{t('housekeeping.laundry')}</h3>
          <div className="p-3 md:p-4">
            <button
              type="button"
              onClick={() => setShowLaundry(true)}
              className="w-full px-3 py-2 bg-teal-600 text-white rounded text-sm min-h-[40px]"
            >
              {t('housekeeping.requestLinen')}
            </button>
          </div>
        </div>
      </div>

      {/* 3) Rooms Needing Cleaning Section */}
      <div className={SECTION_CLASS}>
        <h3 className="font-medium p-3 md:p-4 border-b border-slate-100">{t('housekeeping.roomsNeedingCleaning')}</h3>
        <div className="p-3 md:p-4">
          {needsCleaning.length === 0 ? (
            <p className="text-slate-500 text-sm">{t('housekeeping.noRoomsToClean')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {needsCleaning.map((r) => (
                <div key={r.id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded border w-full md:w-auto min-w-0 ${roomBorderClass(r.status)}`}>
                  <span className="font-medium text-sm truncate">{r.roomNumber}</span>
                  <button
                    type="button"
                    onClick={() => markAsCleaned(r.id)}
                    disabled={!!markingId}
                    className="px-3 py-1.5 bg-teal-600 text-white rounded text-xs disabled:opacity-50 shrink-0"
                  >
                    {markingId === r.id ? '...' : t('housekeeping.markAsCleaned')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4) Maintenance Requests Section */}
      <div className={SECTION_CLASS}>
        <div className="p-3 md:p-4 border-b border-slate-100 flex flex-col md:flex-row md:flex-wrap gap-2 md:gap-3">
          <h3 className="font-medium">{t('housekeeping.maintenanceRequests')}</h3>
          <select
            value={maintFilter}
            onChange={(e) => setMaintFilter(e.target.value as MaintFilter)}
            className="w-full md:w-auto px-3 py-2 border rounded text-sm min-h-[40px]"
          >
            <option value="all">{t('housekeeping.filterAll')}</option>
            <option value="pending">{t('housekeeping.pending')}</option>
            <option value="in_progress">{t('housekeeping.inProgress')}</option>
            <option value="resolved">{t('housekeeping.resolved')}</option>
            <option value="by_room">{t('housekeeping.filterByRoom')}</option>
            <option value="by_date">{t('housekeeping.filterByDate')}</option>
          </select>
          {maintFilter === 'by_room' && (
            <select value={maintRoomFilter} onChange={(e) => setMaintRoomFilter(e.target.value)} className="w-full md:w-auto px-3 py-2 border rounded text-sm min-h-[40px]">
              <option value="">{t('housekeeping.selectRoom')}</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.roomNumber}>{r.roomNumber}</option>
              ))}
            </select>
          )}
          {maintFilter === 'by_date' && (
            <select value={maintDateFilter} onChange={(e) => setMaintDateFilter(e.target.value as MaintDateFilter)} className="w-full md:w-auto px-3 py-2 border rounded text-sm min-h-[40px]">
              <option value="today">{t('housekeeping.today')}</option>
              <option value="week">{t('housekeeping.thisWeek')}</option>
              <option value="month">{t('housekeeping.thisMonth')}</option>
            </select>
          )}
        </div>
        {/* Mobile: stacked cards */}
        <div className="md:hidden p-3 space-y-2">
          {filteredMaintenance.length === 0 ? (
            <p className="text-slate-500 text-sm py-4">{t('common.noItems')}</p>
          ) : (
            filteredMaintenance.map((req) => {
              const desc = req.description;
              const showMore = expandedMaintId === req.id;
              const truncated = isLongDesc(desc) && !showMore;
              return (
                <div key={req.id} className="border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="text-xs text-slate-500">{t('frontOffice.roomNumber')}</div>
                  <div className="font-medium break-words">{rooms.find((r) => r.id === req.roomId)?.roomNumber ?? '-'}</div>
                  <div className="text-xs text-slate-500 mt-2">{t('housekeeping.description')}</div>
                  <div className="text-sm break-words">
                    {truncated ? `${desc.slice(0, DESCR_MAX)}...` : desc}
                    {isLongDesc(desc) && (
                      <button type="button" onClick={() => setExpandedMaintId(showMore ? null : req.id)} className="text-teal-600 text-xs ml-1">
                        {showMore ? t('housekeeping.viewLess') : t('housekeeping.viewMore')}
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-2">{t('housekeeping.status')}</div>
                  <div className="text-sm">{maintenanceStatusLabel(req.status)}</div>
                  <div className="text-xs text-slate-500 mt-2">{t('common.date')}</div>
                  <div className="text-sm">{new Date(req.createdAt).toLocaleString()}</div>
                  {isAdmin && (req.status === 'PENDING' || req.status === 'IN_PROGRESS') && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {req.status === 'PENDING' && (
                        <button type="button" onClick={() => updateMaintenanceStatus(req.id, 'IN_PROGRESS')} className="w-full py-2 border border-slate-300 rounded text-xs">
                          {t('housekeeping.inProgress')}
                        </button>
                      )}
                      <button type="button" onClick={() => updateMaintenanceStatus(req.id, 'APPROVED')} className="flex-1 min-w-0 py-2 bg-teal-600 text-white rounded text-xs">
                        {t('housekeeping.resolve')}
                      </button>
                      <button type="button" onClick={() => updateMaintenanceStatus(req.id, 'REJECTED')} className="flex-1 min-w-0 py-2 border border-slate-300 rounded text-xs">
                        {t('housekeeping.reject')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        {/* Desktop: table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-3">{t('frontOffice.roomNumber')}</th>
                <th className="text-left p-3">{t('housekeeping.description')}</th>
                <th className="text-left p-3">{t('housekeeping.status')}</th>
                <th className="text-left p-3">{t('common.date')}</th>
                {isAdmin && <th className="w-40"></th>}
              </tr>
            </thead>
            <tbody>
              {filteredMaintenance.length === 0 ? (
                <tr><td className="p-4 text-slate-500" colSpan={isAdmin ? 5 : 4}>{t('common.noItems')}</td></tr>
              ) : (
                filteredMaintenance.map((req) => {
                  const desc = req.description;
                  const showMore = expandedMaintId === req.id;
                  const truncated = isLongDesc(desc) && !showMore;
                  return (
                    <tr key={req.id} className="border-t border-slate-100">
                      <td className="p-3">{rooms.find((r) => r.id === req.roomId)?.roomNumber ?? '-'}</td>
                      <td className="p-3 max-w-[200px]">
                        <span className="break-words">{truncated ? `${desc.slice(0, DESCR_MAX)}...` : desc}</span>
                        {isLongDesc(desc) && (
                          <button type="button" onClick={() => setExpandedMaintId(showMore ? null : req.id)} className="text-teal-600 text-xs ml-1">
                            {showMore ? t('housekeeping.viewLess') : t('housekeeping.viewMore')}
                          </button>
                        )}
                      </td>
                      <td className="p-3">{maintenanceStatusLabel(req.status)}</td>
                      <td className="p-3 whitespace-nowrap">{new Date(req.createdAt).toLocaleString()}</td>
                      {isAdmin && (
                        <td className="p-3">
                          {req.status === 'PENDING' && (
                            <div className="flex flex-wrap gap-1">
                              <button type="button" onClick={() => updateMaintenanceStatus(req.id, 'IN_PROGRESS')} className="px-2 py-1 border border-slate-300 rounded text-xs hover:bg-slate-50">
                                {t('housekeeping.inProgress')}
                              </button>
                              <button type="button" onClick={() => updateMaintenanceStatus(req.id, 'APPROVED')} className="px-2 py-1 bg-teal-600 text-white rounded text-xs">
                                {t('housekeeping.resolve')}
                              </button>
                              <button type="button" onClick={() => updateMaintenanceStatus(req.id, 'REJECTED')} className="px-2 py-1 border border-slate-300 rounded text-xs hover:bg-slate-50">
                                {t('housekeeping.reject')}
                              </button>
                            </div>
                          )}
                          {req.status === 'IN_PROGRESS' && (
                            <div className="flex flex-wrap gap-1">
                              <button type="button" onClick={() => updateMaintenanceStatus(req.id, 'APPROVED')} className="px-2 py-1 bg-teal-600 text-white rounded text-xs">
                                {t('housekeeping.resolve')}
                              </button>
                              <button type="button" onClick={() => updateMaintenanceStatus(req.id, 'REJECTED')} className="px-2 py-1 border border-slate-300 rounded text-xs hover:bg-slate-50">
                                {t('housekeeping.reject')}
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5) Combined History Section */}
      <div className={SECTION_CLASS}>
        <div className="p-3 md:p-4 border-b border-slate-100 flex flex-col md:flex-row md:flex-wrap gap-2 md:gap-3">
          <h3 className="font-medium">{t('housekeeping.history')}</h3>
          <select value={historyType} onChange={(e) => setHistoryType(e.target.value as HistoryType)} className="w-full md:w-auto px-3 py-2 border rounded text-sm min-h-[40px]">
            <option value="cleaning">{t('housekeeping.cleaningHistory')}</option>
            <option value="laundry">{t('housekeeping.laundryHistory')}</option>
            <option value="all">{t('housekeeping.allActivity')}</option>
          </select>
          <select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value as HistoryFilter)} className="w-full md:w-auto px-3 py-2 border rounded text-sm min-h-[40px]">
            <option value="today">{t('housekeeping.today')}</option>
            <option value="week">{t('housekeeping.thisWeek')}</option>
            <option value="month">{t('housekeeping.thisMonth')}</option>
            <option value="by_room">{t('housekeeping.filterByRoom')}</option>
            <option value="by_staff">{t('housekeeping.filterByStaff')}</option>
          </select>
          {historyFilter === 'by_room' && (
            <select value={historyRoomFilter} onChange={(e) => setHistoryRoomFilter(e.target.value)} className="w-full md:w-auto px-3 py-2 border rounded text-sm min-h-[40px]">
              <option value="">{t('housekeeping.selectRoom')}</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.roomNumber}>{r.roomNumber}</option>
              ))}
            </select>
          )}
          {historyFilter === 'by_staff' && (
            <input
              type="text"
              value={historyStaffFilter}
              onChange={(e) => setHistoryStaffFilter(e.target.value)}
              placeholder={t('housekeeping.staffName')}
              className="w-full md:w-40 px-3 py-2 border rounded text-sm min-h-[40px]"
            />
          )}
        </div>
        <div className="p-3 md:p-0">
          {(historyType === 'cleaning' || historyType === 'all') && (
            <>
              <h4 className="p-2 md:p-3 text-sm font-medium text-slate-600">{t('housekeeping.cleaningHistory')}</h4>
              {/* Mobile: stacked cards */}
              <div className="md:hidden space-y-2">
                {filteredCleaningLogs.length === 0 ? (
                  <p className="text-slate-500 text-sm py-4">{t('common.noItems')}</p>
                ) : (
                  filteredCleaningLogs.map((l) => (
                    <div key={l.id} className="border border-slate-200 rounded-lg p-3 bg-white">
                      <div className="text-xs text-slate-500">{t('frontOffice.roomNumber')}</div>
                      <div className="font-medium break-words">{l.room?.roomNumber ?? '-'}</div>
                      <div className="text-xs text-slate-500 mt-2">{t('housekeeping.cleanedBy')}</div>
                      <div className="text-sm break-words">{l.cleanedByWorkerName ?? '-'}</div>
                      <div className="text-xs text-slate-500 mt-2">{t('common.date')}</div>
                      <div className="text-sm">{new Date(l.createdAt).toLocaleString()}</div>
                    </div>
                  ))
                )}
              </div>
              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left p-3">{t('frontOffice.roomNumber')}</th>
                      <th className="text-left p-3">{t('housekeeping.cleanedBy')}</th>
                      <th className="text-left p-3">{t('common.date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCleaningLogs.length === 0 ? (
                      <tr><td className="p-4 text-slate-500" colSpan={3}>{t('common.noItems')}</td></tr>
                    ) : (
                      filteredCleaningLogs.map((l) => (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="p-3">{l.room?.roomNumber ?? '-'}</td>
                          <td className="p-3">{l.cleanedByWorkerName ?? '-'}</td>
                          <td className="p-3 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {(historyType === 'laundry' || historyType === 'all') && (
            <>
              <h4 className={`text-sm font-medium text-slate-600 p-2 md:p-3 ${historyType === 'all' ? 'pt-4 md:pt-6' : ''}`}>{t('housekeeping.laundryHistory')}</h4>
              {/* Mobile: stacked cards */}
              <div className="md:hidden space-y-2">
                {filteredLaundryRequests.length === 0 ? (
                  <p className="text-slate-500 text-sm py-4">{t('common.noItems')}</p>
                ) : (
                  filteredLaundryRequests.map((l) => (
                    <div key={l.id} className="border border-slate-200 rounded-lg p-3 bg-white">
                      <div className="text-xs text-slate-500">{t('frontOffice.roomNumber')}</div>
                      <div className="font-medium break-words">{l.roomNumber ?? '-'}</div>
                      <div className="text-xs text-slate-500 mt-2">{t('housekeeping.item')}</div>
                      <div className="text-sm break-words">{l.item}</div>
                      <div className="text-xs text-slate-500 mt-2">{t('housekeeping.quantity')}</div>
                      <div className="text-sm">{l.quantity}</div>
                      <div className="text-xs text-slate-500 mt-2">{t('housekeeping.status')}</div>
                      <div className="text-sm">{laundryStatusLabel(l.status)}</div>
                      <div className="text-xs text-slate-500 mt-2">{t('housekeeping.assignedTo')}</div>
                      <div className="text-sm break-words">{l.assignedToWorker?.fullName ?? '-'}</div>
                      <div className="flex flex-col gap-2 mt-3">
                        {isAdmin && l.status === 'COMPLETED' && (
                          <button type="button" onClick={() => markLaundryDelivered(l.id)} className="w-full py-2 bg-teal-600 text-white rounded text-sm">
                            {t('housekeeping.markDelivered')}
                          </button>
                        )}
                        {isAdmin && !['DELIVERED'].includes(l.status) && (
                          <button type="button" onClick={() => { setAssignLaundryId(l.id); setShowAssignLaundry(true); setAssignWorkerId(l.assignedToWorker?.id ?? ''); }} className="w-full py-2 border border-slate-300 rounded text-sm">
                            {t('housekeeping.assign')}
                          </button>
                        )}
                        {['ASSIGNED', 'IN_PROGRESS'].includes(l.status) && (
                          <select
                            value={l.status}
                            onChange={(e) => updateLaundryStatus(l.id, e.target.value)}
                            className="w-full px-3 py-2 border rounded text-sm min-h-[40px]"
                          >
                            <option value="ASSIGNED">{laundryStatusLabel('ASSIGNED')}</option>
                            <option value="IN_PROGRESS">{laundryStatusLabel('IN_PROGRESS')}</option>
                            <option value="COMPLETED">{laundryStatusLabel('COMPLETED')}</option>
                          </select>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left p-3">{t('frontOffice.roomNumber')}</th>
                      <th className="text-left p-3">{t('housekeeping.item')}</th>
                      <th className="text-right p-3">{t('housekeeping.quantity')}</th>
                      <th className="text-left p-3">{t('housekeeping.status')}</th>
                      <th className="text-left p-3">{t('housekeeping.assignedTo')}</th>
                      <th className="w-32"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLaundryRequests.length === 0 ? (
                      <tr><td className="p-4 text-slate-500" colSpan={6}>{t('common.noItems')}</td></tr>
                    ) : (
                      filteredLaundryRequests.map((l) => (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="p-3">{l.roomNumber ?? '-'}</td>
                          <td className="p-3">{l.item}</td>
                          <td className="p-3 text-right">{l.quantity}</td>
                          <td className="p-3">{laundryStatusLabel(l.status)}</td>
                          <td className="p-3">{l.assignedToWorker?.fullName ?? '-'}</td>
                          <td className="p-3">
                            {isAdmin && l.status === 'COMPLETED' && (
                              <button type="button" onClick={() => markLaundryDelivered(l.id)} className="text-teal-600 text-xs hover:underline mr-2">
                                {t('housekeeping.markDelivered')}
                              </button>
                            )}
                            {isAdmin && !['DELIVERED'].includes(l.status) && (
                              <button type="button" onClick={() => { setAssignLaundryId(l.id); setShowAssignLaundry(true); setAssignWorkerId(l.assignedToWorker?.id ?? ''); }} className="text-slate-600 text-xs hover:underline mr-2">
                                {t('housekeeping.assign')}
                              </button>
                            )}
                            {['ASSIGNED', 'IN_PROGRESS'].includes(l.status) && (
                              <select
                                value={l.status}
                                onChange={(e) => updateLaundryStatus(l.id, e.target.value)}
                                className="px-2 py-1 border rounded text-xs"
                              >
                                <option value="ASSIGNED">{laundryStatusLabel('ASSIGNED')}</option>
                                <option value="IN_PROGRESS">{laundryStatusLabel('IN_PROGRESS')}</option>
                                <option value="COMPLETED">{laundryStatusLabel('COMPLETED')}</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showReportIssue && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-lg w-full md:max-w-md max-h-[90vh] md:max-h-none overflow-y-auto flex flex-col">
            <div className="p-4 flex-1 overflow-y-auto">
            <h3 className="font-medium mb-4">{t('housekeeping.reportIssue')}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">{t('frontOffice.roomNumber')}</label>
                <input value={selectedRoom?.roomNumber ?? ''} readOnly className="w-full px-3 py-2 border rounded text-sm bg-slate-50" />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('housekeeping.priority')}</label>
                <select value={reportPriority} onChange={(e) => setReportPriority(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')} className="w-full px-3 py-2 border rounded text-sm">
                  <option value="LOW">{t('housekeeping.priorityLow')}</option>
                  <option value="MEDIUM">{t('housekeeping.priorityMedium')}</option>
                  <option value="HIGH">{t('housekeeping.priorityHigh')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">{t('housekeeping.issueDescription')}</label>
                <textarea value={reportDesc} onChange={(e) => setReportDesc(e.target.value)} placeholder={t('housekeeping.issueDescription')} className="w-full px-3 py-2 border rounded text-sm min-h-[80px]" />
              </div>
            </div>
            <div className="flex gap-2 mt-4 sticky bottom-0 bg-white pt-2 pb-4 md:pb-0 md:pt-0 md:sticky-none">
              <button onClick={submitReport} disabled={submitting || !reportDesc.trim()} className="flex-1 py-2.5 md:py-2 bg-teal-600 text-white rounded text-sm disabled:opacity-50">
                {submitting ? '...' : t('common.save')}
              </button>
              <button onClick={() => { setShowReportIssue(false); setReportDesc(''); setReportPriority('MEDIUM'); }} className="flex-1 py-2.5 md:py-2 border rounded text-sm">
                {t('common.cancel')}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {showLaundry && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-lg w-full md:max-w-md max-h-[90vh] md:max-h-none overflow-y-auto flex flex-col">
            <div className="p-4 flex-1 overflow-y-auto">
            <h3 className="font-medium mb-4">{t('housekeeping.requestLinen')}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">{t('frontOffice.roomNumber')}</label>
                <input value={laundryRoom} onChange={(e) => setLaundryRoom(e.target.value)} placeholder="e.g. 101" className="w-full px-3 py-2 border rounded text-sm" />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('housekeeping.item')}</label>
                <input value={laundryItem} onChange={(e) => setLaundryItem(e.target.value)} placeholder="e.g. Towels, Sheets" className="w-full px-3 py-2 border rounded text-sm" />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('housekeeping.quantity')}</label>
                <input type="number" min="1" value={laundryQty} onChange={(e) => setLaundryQty(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" />
              </div>
            </div>
            <div className="flex gap-2 mt-4 sticky bottom-0 bg-white pt-2 pb-4 md:pb-0 md:pt-0 md:sticky-none">
              <button onClick={createLaundryRequest} disabled={submitting || !laundryItem.trim()} className="flex-1 py-2.5 md:py-2 bg-teal-600 text-white rounded text-sm disabled:opacity-50">
                {submitting ? '...' : t('common.save')}
              </button>
              <button onClick={() => { setShowLaundry(false); setLaundryRoom(''); setLaundryItem(''); setLaundryQty('1'); }} className="flex-1 py-2.5 md:py-2 border rounded text-sm">
                {t('common.cancel')}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {showAssignCleaning && selectedRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-lg w-full md:max-w-md max-h-[90vh] md:max-h-none overflow-y-auto p-4">
            <h3 className="font-medium mb-4 break-words">{t('housekeeping.assignCleaning')} — {selectedRoom.roomNumber}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">{t('housekeeping.assignToStaff')}</label>
                <select value={assignWorkerId} onChange={(e) => setAssignWorkerId(e.target.value)} className="w-full px-3 py-2 border rounded text-sm min-h-[44px]">
                  <option value="">{t('common.select')}</option>
                  {staffWorkers.map((w) => (
                    <option key={w.id} value={w.id}>{w.fullName}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => assignCleaning(selectedRoom.id)} disabled={submitting || !assignWorkerId} className="flex-1 py-2.5 bg-teal-600 text-white rounded text-sm disabled:opacity-50">
                {submitting ? '...' : t('common.save')}
              </button>
              <button onClick={() => { setShowAssignCleaning(false); setAssignWorkerId(''); }} className="flex-1 py-2.5 border rounded text-sm">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssignLaundry && assignLaundryId && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-lg w-full md:max-w-md max-h-[90vh] md:max-h-none overflow-y-auto p-4">
            <h3 className="font-medium mb-4">{t('housekeeping.assignLaundry')}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">{t('housekeeping.assignToStaff')}</label>
                <select value={assignWorkerId} onChange={(e) => setAssignWorkerId(e.target.value)} className="w-full px-3 py-2 border rounded text-sm min-h-[44px]">
                  <option value="">{t('common.select')}</option>
                  {staffWorkers.map((w) => (
                    <option key={w.id} value={w.id}>{w.fullName}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => assignLaundry(assignLaundryId)} disabled={submitting || !assignWorkerId} className="flex-1 py-2.5 bg-teal-600 text-white rounded text-sm disabled:opacity-50">
                {submitting ? '...' : t('common.save')}
              </button>
              <button onClick={() => { setShowAssignLaundry(false); setAssignLaundryId(null); setAssignWorkerId(''); }} className="flex-1 py-2.5 border rounded text-sm">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
