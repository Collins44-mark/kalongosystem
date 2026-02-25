'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { useSearch } from '@/store/search';
import { notifyError, notifySuccess } from '@/store/notifications';
import { isManagerLevel } from '@/lib/roles';

type Room = { id: string; roomNumber: string; status: string; category: { name: string }; cleaningLogs?: CleaningLog[] };
type CleaningLog = { id: string; roomId: string; cleanedByWorkerName: string | null; createdAt: string; room?: { roomNumber: string } };
type MaintenanceRequest = { id: string; roomId: string | null; description: string; type: string; status: string; createdAt: string };
type LaundryRequest = { id: string; roomNumber: string | null; item: string; quantity: number; status: string; createdAt: string; deliveredAt: string | null };

function roomBorderClass(status: string): string {
  if (status === 'OCCUPIED') return 'border-green-200 bg-green-50';
  if (status === 'RESERVED') return 'border-amber-200 bg-amber-50';
  if (status === 'UNDER_MAINTENANCE') return 'border-red-200 bg-red-50';
  return 'border-slate-300 bg-slate-100';
}

export default function HousekeepingPage() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const searchQuery = useSearch((s) => s.query);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [cleaningLogs, setCleaningLogs] = useState<CleaningLog[]>([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [laundryRequests, setLaundryRequests] = useState<LaundryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [statusSaving, setStatusSaving] = useState<string | null>(null);
  const [showReportIssue, setShowReportIssue] = useState(false);
  const [showLaundry, setShowLaundry] = useState(false);
  const [reportDesc, setReportDesc] = useState('');
  const [laundryRoom, setLaundryRoom] = useState('');
  const [laundryItem, setLaundryItem] = useState('');
  const [laundryQty, setLaundryQty] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const isAdmin = isManagerLevel(user?.role);

  function refresh() {
    if (!token) return;
    Promise.all([
      api<Room[]>('/housekeeping/rooms', { token }),
      api<CleaningLog[]>('/housekeeping/cleaning-logs', { token }),
      api<MaintenanceRequest[]>('/housekeeping/requests', { token }),
      api<LaundryRequest[]>('/housekeeping/laundry', { token }),
    ]).then(([r, c, m, l]) => {
      setRooms(r);
      setCleaningLogs(c);
      setMaintenanceRequests(m);
      setLaundryRequests(l);
      setSelectedRoom((prev) => (prev ? r.find((x) => x.id === prev.id) ?? null : null));
    }).catch(() => {}).finally(() => setLoading(false));
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
      await api(`/housekeeping/rooms/${roomId}/mark-cleaned`, { method: 'POST', token });
      notifySuccess(t('housekeeping.markAsCleaned'));
      refresh();
      if (selectedRoom?.id === roomId) setSelectedRoom(null);
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setMarkingId(null);
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

  async function submitReport() {
    if (!token || !reportDesc.trim()) return;
    setSubmitting(true);
    try {
      await api('/housekeeping/requests', {
        method: 'POST',
        token,
        body: JSON.stringify({ description: reportDesc.trim(), type: 'MAINTENANCE', roomId: selectedRoom?.id ?? undefined }),
      });
      notifySuccess(t('housekeeping.reportIssue'));
      setShowReportIssue(false);
      setReportDesc('');
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
    if (!token) return;
    try {
      await api(`/housekeeping/laundry/${id}/delivered`, { method: 'POST', token });
      notifySuccess(t('housekeeping.markDelivered'));
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

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('housekeeping.title')}</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <div className={`p-4 rounded-lg border ${roomBorderClass('VACANT')}`}>
          <div className="text-xs text-slate-600">{t('overview.totalRooms')}</div>
          <div className="text-xl font-semibold">{rooms.length}</div>
        </div>
        <div className={`p-4 rounded-lg border ${roomBorderClass('OCCUPIED')}`}>
          <div className="text-xs text-slate-600">{t('overview.occupied')}</div>
          <div className="text-xl font-semibold">{rooms.filter((r) => r.status === 'OCCUPIED').length}</div>
        </div>
        <div className={`p-4 rounded-lg border ${roomBorderClass('VACANT')}`}>
          <div className="text-xs text-slate-600">{t('overview.vacant')}</div>
          <div className="text-xl font-semibold">{rooms.filter((r) => r.status === 'VACANT').length}</div>
        </div>
        <div className={`p-4 rounded-lg border ${roomBorderClass('RESERVED')}`}>
          <div className="text-xs text-slate-600">{t('overview.reserved')}</div>
          <div className="text-xl font-semibold">{rooms.filter((r) => r.status === 'RESERVED').length}</div>
        </div>
        <div className={`p-4 rounded-lg border ${roomBorderClass('UNDER_MAINTENANCE')}`}>
          <div className="text-xs text-slate-600">{t('overview.underMaintenance')}</div>
          <div className="text-xl font-semibold">{needsCleaning.length}</div>
        </div>
        <div className="p-4 rounded-lg border border-slate-300 bg-slate-50">
          <div className="text-xs text-slate-600">{t('housekeeping.cleanedToday')}</div>
          <div className="text-xl font-semibold">{cleanedTodayCount}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Room Grid + Task Panel */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="font-medium mb-3">{t('overview.rooms')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {displayedRooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRoom(selectedRoom?.id === r.id ? null : r)}
                  className={`p-3 sm:p-4 rounded-lg border min-h-[80px] flex flex-col justify-between text-left ${roomBorderClass(r.status)} ${
                    selectedRoom?.id === r.id ? 'ring-2 ring-teal-400' : ''
                  }`}
                >
                  <div>
                    <div className="font-medium text-sm sm:text-base">{r.roomNumber}</div>
                    <div className="text-xs text-slate-600">{r.category?.name ?? '-'}</div>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{statusLabel(r.status)}</div>
                </button>
              ))}
            </div>
            {displayedRooms.length === 0 && <p className="text-slate-500 text-sm py-4">{t('common.noItems')}</p>}
          </div>

          {/* Task Panel: Rooms Needing Cleaning */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <h3 className="font-medium p-4 border-b">{t('housekeeping.roomsNeedingCleaning')}</h3>
            <div className="p-4">
              {needsCleaning.length === 0 ? (
                <p className="text-slate-500 text-sm">{t('housekeeping.noRoomsToClean')}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {needsCleaning.map((r) => (
                    <div key={r.id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded border ${roomBorderClass(r.status)}`}>
                      <span className="font-medium text-sm">{r.roomNumber}</span>
                      <button
                        type="button"
                        onClick={() => markAsCleaned(r.id)}
                        disabled={!!markingId}
                        className="px-2 py-1 bg-teal-600 text-white rounded text-xs disabled:opacity-50"
                      >
                        {markingId === r.id ? '...' : t('housekeeping.markAsCleaned')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Room Detail + Actions */}
        <div className="space-y-6">
          {selectedRoom ? (
            <div className="bg-white border rounded-lg p-4 sticky top-4">
              <h3 className="font-medium mb-3">{selectedRoom.roomNumber} — {statusLabel(selectedRoom.status)}</h3>
              <div className="text-sm text-slate-600 mb-3">{selectedRoom.category?.name}</div>
              {selectedRoom.cleaningLogs && selectedRoom.cleaningLogs.length > 0 && (
                <div className="mb-3 text-xs">
                  <div className="text-slate-500">{t('housekeeping.lastCleanedBy')}</div>
                  <div>{selectedRoom.cleaningLogs[0]?.cleanedByWorkerName ?? '-'}</div>
                  <div className="text-slate-500">
                    {selectedRoom.cleaningLogs[0]?.createdAt ? new Date(selectedRoom.cleaningLogs[0].createdAt).toLocaleString() : '-'}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {selectedRoom.status === 'UNDER_MAINTENANCE' && (
                  <button
                    type="button"
                    onClick={() => markAsCleaned(selectedRoom.id)}
                    disabled={!!markingId}
                    className="w-full px-3 py-2 bg-teal-600 text-white rounded text-sm disabled:opacity-50"
                  >
                    {markingId === selectedRoom.id ? '...' : t('housekeeping.markAsCleaned')}
                  </button>
                )}
                {isAdmin && (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">{t('housekeeping.status')}</label>
                    <select
                      value={selectedRoom.status}
                      onChange={(e) => setRoomStatus(selectedRoom.id, e.target.value)}
                      disabled={!!statusSaving}
                      className="w-full px-3 py-2 border rounded text-sm"
                    >
                      <option value="VACANT">{t('overview.vacant')}</option>
                      <option value="OCCUPIED">{t('overview.occupied')}</option>
                      <option value="RESERVED">{t('overview.reserved')}</option>
                      <option value="UNDER_MAINTENANCE">{t('overview.underMaintenance')}</option>
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowReportIssue(true)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50"
                >
                  {t('housekeeping.reportIssue')}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border rounded-lg p-4 text-slate-500 text-sm">
              {t('housekeeping.selectRoomHint')}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowLaundry(true)}
              className="flex-1 px-3 py-2 bg-teal-600 text-white rounded text-sm"
            >
              {t('housekeeping.requestLinen')}
            </button>
          </div>

          {/* Cleaning History */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <h3 className="font-medium p-4 border-b">{t('housekeeping.cleaningHistory')}</h3>
            <div className="overflow-x-auto max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3">{t('frontOffice.roomNumber')}</th>
                    <th className="text-left p-3">{t('housekeeping.cleanedBy')}</th>
                    <th className="text-left p-3">{t('common.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cleaningLogs.length === 0 ? (
                    <tr><td className="p-3 text-slate-500" colSpan={3}>{t('common.noItems')}</td></tr>
                  ) : (
                    cleaningLogs.slice(0, 20).map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="p-3">{l.room?.roomNumber ?? '-'}</td>
                        <td className="p-3">{l.cleanedByWorkerName ?? '-'}</td>
                        <td className="p-3 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Laundry History */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <h3 className="font-medium p-4 border-b">{t('housekeeping.laundryHistory')}</h3>
            <div className="overflow-x-auto max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3">{t('frontOffice.roomNumber')}</th>
                    <th className="text-left p-3">{t('housekeeping.item')}</th>
                    <th className="text-right p-3">{t('housekeeping.quantity')}</th>
                    <th className="text-left p-3">{t('housekeeping.status')}</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {laundryRequests.length === 0 ? (
                    <tr><td className="p-3 text-slate-500" colSpan={5}>{t('common.noItems')}</td></tr>
                  ) : (
                    laundryRequests.slice(0, 15).map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="p-3">{l.roomNumber ?? '-'}</td>
                        <td className="p-3">{l.item}</td>
                        <td className="p-3 text-right">{l.quantity}</td>
                        <td className="p-3">{l.status === 'DELIVERED' ? t('housekeeping.delivered') : t('housekeeping.requested')}</td>
                        <td className="p-3">
                          {l.status === 'REQUESTED' && (
                            <button
                              type="button"
                              onClick={() => markLaundryDelivered(l.id)}
                              className="text-teal-600 text-xs hover:underline"
                            >
                              {t('housekeeping.markDelivered')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Maintenance Requests (Admin) */}
          {isAdmin && maintenanceRequests.length > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <h3 className="font-medium p-4 border-b">{t('housekeeping.maintenanceRequests')}</h3>
              <div className="divide-y max-h-40 overflow-y-auto">
                {maintenanceRequests.slice(0, 5).map((req) => (
                  <div key={req.id} className="p-3 text-sm">
                    <div className="font-medium">{req.description}</div>
                    <div className="text-xs text-slate-500">{req.status} · {new Date(req.createdAt).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Report Issue Modal */}
      {showReportIssue && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-4">
            <h3 className="font-medium mb-3">{t('housekeeping.reportIssue')}</h3>
            <textarea
              value={reportDesc}
              onChange={(e) => setReportDesc(e.target.value)}
              placeholder={t('housekeeping.reportIssue')}
              className="w-full px-3 py-2 border rounded text-sm mb-4 min-h-[80px]"
            />
            <div className="flex gap-2">
              <button onClick={submitReport} disabled={submitting || !reportDesc.trim()} className="px-4 py-2 bg-teal-600 text-white rounded text-sm disabled:opacity-50">
                {submitting ? '...' : t('common.save')}
              </button>
              <button onClick={() => { setShowReportIssue(false); setReportDesc(''); }} className="px-4 py-2 border rounded text-sm">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Linen Modal */}
      {showLaundry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-4">
            <h3 className="font-medium mb-3">{t('housekeeping.requestLinen')}</h3>
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
            <div className="flex gap-2 mt-4">
              <button onClick={createLaundryRequest} disabled={submitting || !laundryItem.trim()} className="px-4 py-2 bg-teal-600 text-white rounded text-sm disabled:opacity-50">
                {submitting ? '...' : t('common.save')}
              </button>
              <button onClick={() => { setShowLaundry(false); setLaundryRoom(''); setLaundryItem(''); setLaundryQty('1'); }} className="px-4 py-2 border rounded text-sm">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
