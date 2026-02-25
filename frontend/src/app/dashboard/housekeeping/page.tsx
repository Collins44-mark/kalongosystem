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
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const isAdmin = isManagerLevel(user?.role);

  useEffect(() => {
    if (!token) return;
    api<Room[]>('/housekeeping/rooms', { token })
      .then(setRooms)
      .catch(() => setRooms([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api<CleaningLog[]>('/housekeeping/cleaning-logs', { token })
      .then(setCleaningLogs)
      .catch(() => setCleaningLogs([]));
  }, [token]);

  async function markAsCleaned(roomId: string) {
    if (!token) return;
    setMarkingId(roomId);
    try {
      await api(`/housekeeping/rooms/${roomId}/mark-cleaned`, { method: 'POST', token });
      notifySuccess(t('housekeeping.markAsCleaned'));
      const [roomsRes, logsRes] = await Promise.all([
        api<Room[]>('/housekeeping/rooms', { token }),
        api<CleaningLog[]>('/housekeeping/cleaning-logs', { token }),
      ]);
      setRooms(roomsRes);
      setCleaningLogs(logsRes);
      if (selectedRoom?.id === roomId) {
        setSelectedRoom(roomsRes.find((r) => r.id === roomId) ?? null);
      }
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setMarkingId(null);
    }
  }

  async function setRoomStatus(roomId: string, status: 'VACANT' | 'UNDER_MAINTENANCE') {
    if (!token) return;
    setStatusSaving(true);
    try {
      await api(`/housekeeping/rooms/${roomId}/status`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ status }),
      });
      notifySuccess(status === 'UNDER_MAINTENANCE' ? t('housekeeping.setMaintenance') : t('housekeeping.removeMaintenance'));
      const res = await api<Room[]>('/housekeeping/rooms', { token });
      setRooms(res);
      if (selectedRoom?.id === roomId) {
        setSelectedRoom(res.find((r) => r.id === roomId) ?? null);
      }
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setStatusSaving(false);
    }
  }

  if (loading) return <div>{t('common.loading')}</div>;

  const q = (searchQuery || '').trim().toLowerCase();
  const displayedRooms = !q
    ? rooms
    : rooms.filter((r) => {
        const txt = `${r.roomNumber} ${r.status} ${r.category?.name ?? ''}`.toLowerCase();
        return txt.includes(q);
      });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const cleanedTodayCount = cleaningLogs.filter((l) => new Date(l.createdAt) >= todayStart).length;

  const statusLabel = (s: string) => {
    if (s === 'OCCUPIED') return t('overview.occupied');
    if (s === 'VACANT') return t('overview.vacant');
    if (s === 'RESERVED') return t('overview.reserved');
    return t('overview.underMaintenance');
  };

  if (isAdmin) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-4">{t('housekeeping.title')}</h1>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-6">
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
            <div className="text-xl font-semibold">{rooms.filter((r) => r.status === 'UNDER_MAINTENANCE').length}</div>
          </div>
          <div className="p-4 rounded-lg border border-slate-300 bg-slate-50">
            <div className="text-xs text-slate-600">{t('housekeeping.cleanedToday')}</div>
            <div className="text-xl font-semibold">{cleanedTodayCount}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
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
            {displayedRooms.length === 0 && (
              <p className="text-slate-500 text-sm py-4">{t('common.noItems')}</p>
            )}
          </div>

          <div>
            {selectedRoom ? (
              <div className="bg-white border rounded-lg p-4 sticky top-4">
                <h3 className="font-medium mb-3">{selectedRoom.roomNumber} — {statusLabel(selectedRoom.status)}</h3>
                <div className="text-sm text-slate-600 mb-3">{selectedRoom.category?.name}</div>
                {selectedRoom.cleaningLogs && selectedRoom.cleaningLogs.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-slate-500 mb-1">{t('housekeeping.lastCleanedBy')}</div>
                    <div className="text-sm">{selectedRoom.cleaningLogs[0]?.cleanedByWorkerName ?? '-'}</div>
                    <div className="text-xs text-slate-500">
                      {selectedRoom.cleaningLogs[0]?.createdAt
                        ? new Date(selectedRoom.cleaningLogs[0].createdAt).toLocaleString()
                        : '-'}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {(selectedRoom.status === 'VACANT' || selectedRoom.status === 'UNDER_MAINTENANCE') && (
                    <>
                      <button
                        type="button"
                        onClick={() => markAsCleaned(selectedRoom.id)}
                        disabled={!!markingId}
                        className="w-full px-3 py-2 bg-teal-600 text-white rounded text-sm disabled:opacity-50"
                      >
                        {markingId === selectedRoom.id ? '...' : t('housekeeping.markAsCleaned')}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setRoomStatus(
                            selectedRoom.id,
                            selectedRoom.status === 'VACANT' ? 'UNDER_MAINTENANCE' : 'VACANT',
                          )
                        }
                        disabled={statusSaving}
                        className={`w-full px-3 py-2 rounded text-sm border disabled:opacity-50 ${
                          selectedRoom.status === 'VACANT'
                            ? 'border-red-300 text-red-700 hover:bg-red-50'
                            : 'border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {selectedRoom.status === 'VACANT' ? t('housekeeping.setMaintenance') : t('housekeeping.removeMaintenance')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white border rounded-lg p-4 text-slate-500 text-sm">
                {t('housekeeping.selectRoomHint')}
              </div>
            )}

            <div className="mt-6 bg-white border rounded-lg overflow-hidden">
              <h3 className="font-medium p-4 border-b">{t('housekeeping.cleaningHistory')}</h3>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
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
                      <tr>
                        <td className="p-3 text-slate-500" colSpan={3}>{t('common.noItems')}</td>
                      </tr>
                    ) : (
                      cleaningLogs.map((l) => (
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">{t('housekeeping.title')}</h1>

      <div className="mb-6">
        <h2 className="font-medium mb-3">{t('housekeeping.needsCleaning')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {displayedRooms.map((r) => (
            <div
              key={r.id}
              className={`p-4 rounded-lg border ${roomBorderClass(r.status)}`}
            >
              <div className="font-medium">{r.roomNumber}</div>
              <div className="text-sm text-slate-600">{r.category?.name ?? '-'}</div>
              <div className="text-xs text-slate-500 mt-1">{statusLabel(r.status)}</div>
              <button
                type="button"
                onClick={() => markAsCleaned(r.id)}
                disabled={!!markingId}
                className="mt-3 w-full px-3 py-2 bg-teal-600 text-white rounded text-sm disabled:opacity-50"
              >
                {markingId === r.id ? '...' : t('housekeeping.markAsCleaned')}
              </button>
            </div>
          ))}
        </div>
        {displayedRooms.length === 0 && (
          <p className="text-slate-500 text-sm py-4">{t('housekeeping.noRoomsToClean')}</p>
        )}
      </div>

      <div className="mt-8 bg-white border rounded-lg overflow-hidden">
        <h2 className="font-medium p-4 border-b">{t('housekeeping.cleaningHistory')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-3">{t('frontOffice.roomNumber')}</th>
                <th className="text-left p-3">{t('housekeeping.cleanedBy')}</th>
                <th className="text-left p-3">{t('common.date')}</th>
              </tr>
            </thead>
            <tbody>
              {cleaningLogs.length === 0 ? (
                <tr>
                  <td className="p-3 text-slate-500" colSpan={3}>{t('common.noItems')}</td>
                </tr>
              ) : (
                cleaningLogs.map((l) => (
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
    </div>
  );
}
