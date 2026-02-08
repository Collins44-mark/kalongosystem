'use client';

/**
 * Calendar View (Beta) - Optional drag & drop booking.
 * Only shown when Settings → System → Enable Drag & Drop Booking is ON.
 * Vertical: Rooms, Horizontal: Dates. Draggable booking blocks.
 * MANAGER: drag freely. FRONT_OFFICE: confirm via modal.
 * Mobile: list view, tap-based edit (no drag).
 */
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type Room = { id: string; roomNumber: string; roomName?: string; status: string; category: { id: string; name: string; pricePerNight: string } };
type Booking = {
  id: string;
  guestName: string;
  room: Room;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: string;
  status: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function getDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function CalendarView({
  token,
  rooms,
  bookings: initialBookings,
  isManager,
  onAction,
  t,
}: {
  token: string;
  rooms: Room[];
  bookings: Booking[];
  isManager: boolean;
  onAction: () => void;
  t: (k: string) => string;
}) {
  const [rangeDays, setRangeDays] = useState(14);
  const [startDate, setStartDate] = useState(() => getDateStr(new Date()));
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [editBooking, setEditBooking] = useState<{
    booking: Booking;
    newRoomId: string;
    newCheckOut: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Fetch bookings for calendar date range (scope=all, from/to)
  useEffect(() => {
    if (!token) return;
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + rangeDays);
    const from = getDateStr(start);
    const to = getDateStr(end);
    setLoadingBookings(true);
    api<Booking[]>(`/hotel/bookings?scope=all&from=${from}&to=${to}`, { token })
      .then(setBookings)
      .catch(() => setBookings((prev) => prev.length ? prev : initialBookings))
      .finally(() => setLoadingBookings(false));
  }, [token, startDate, rangeDays]);

  const start = new Date(startDate);
  const dates = Array.from({ length: rangeDays }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const sortedRooms = [...rooms].sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));

  const bookingInRange = (b: Booking) => {
    const ci = new Date(b.checkIn).getTime();
    const co = new Date(b.checkOut).getTime();
    const r0 = dates[0]?.getTime() ?? 0;
    const r1 = (dates[dates.length - 1]?.getTime() ?? 0) + DAY_MS;
    return ci < r1 && co > r0;
  };
  const visibleBookings = bookings.filter((b) => ['CONFIRMED', 'CHECKED_IN', 'RESERVED'].includes(b.status) && bookingInRange(b));

  const getBookingColInfo = (b: Booking) => {
    const ci = new Date(b.checkIn);
    ci.setHours(0, 0, 0, 0);
    const co = new Date(b.checkOut);
    co.setHours(0, 0, 0, 0);
    let colStart = 0;
    let span = 0;
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      if (!d) continue;
      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);
      const overlaps = ci < dayEnd && co > dayStart;
      if (overlaps) {
        if (span === 0) colStart = i;
        span++;
      }
    }
    return { colStart, span: Math.max(1, span) };
  };

  function openEditModal(booking: Booking) {
    setEditBooking({
      booking,
      newRoomId: booking.room.id,
      newCheckOut: booking.checkOut.slice(0, 10),
    });
  }

  async function applyChange() {
    if (!editBooking) return;
    const { booking, newRoomId, newCheckOut } = editBooking;
    const roomChanged = newRoomId !== booking.room.id;
    const checkoutChanged = newCheckOut !== booking.checkOut.slice(0, 10);
    if (!roomChanged && !checkoutChanged) {
      setEditBooking(null);
      return;
    }
    setSaving(true);
    try {
      if (roomChanged) {
        await api(`/hotel/bookings/${booking.id}/room`, {
          method: 'PUT',
          token,
          body: JSON.stringify({ roomId: newRoomId }),
        });
      }
      if (checkoutChanged) {
        await api(`/hotel/bookings/${booking.id}/extend`, {
          method: 'PUT',
          token,
          body: JSON.stringify({ checkOut: newCheckOut }),
        });
      }
      setEditBooking(null);
      onAction();
      // Refetch calendar bookings to reflect changes
      const start = new Date(startDate);
      const end = new Date(start);
      end.setDate(end.getDate() + rangeDays);
      api<Booking[]>(`/hotel/bookings?scope=all&from=${getDateStr(start)}&to=${getDateStr(end)}`, { token })
        .then(setBookings)
        .catch(() => {});
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (isMobile) {
    return (
      <div className="space-y-4">
        {loadingBookings && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
        <p className="text-sm text-slate-500">{t('frontOffice.calendarListHint')}</p>
        <div className="space-y-2">
          {visibleBookings.map((b) => (
            <div
              key={b.id}
              className="p-3 bg-white border rounded shadow-sm"
              onClick={() => openEditModal(b)}
            >
              <div className="font-medium">{b.guestName}</div>
              <div className="text-sm text-slate-600">
                {b.room.roomNumber} · {new Date(b.checkIn).toLocaleDateString()} - {new Date(b.checkOut).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loadingBookings && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-2 py-1 border rounded text-sm"
        />
        <select
          value={rangeDays}
          onChange={(e) => setRangeDays(Number(e.target.value))}
          className="px-2 py-1 border rounded text-sm"
        >
          <option value={7}>7 {t('frontOffice.days')}</option>
          <option value={14}>14 {t('frontOffice.days')}</option>
          <option value={30}>30 {t('frontOffice.days')}</option>
        </select>
      </div>
      <div className="overflow-x-auto border rounded bg-white">
        <table className="w-full border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="text-left p-2 border-b font-medium w-24">{t('frontOffice.room')}</th>
              {dates.map((d) => (
                <th key={d.toISOString()} className="p-2 border-b text-xs text-center font-normal w-20">
                  {d.toLocaleDateString('en', { weekday: 'short' })}
                  <br />
                  {d.getDate()}/{d.getMonth() + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRooms.map((room) => {
              const roomBookings = visibleBookings.filter((b) => b.room.id === room.id);
              const placed = new Set<string>();
              const cells: React.ReactNode[] = [];
              let col = 0;
              while (col < dates.length) {
                const d = dates[col];
                const b = roomBookings.find((x) => {
                  const { colStart } = getBookingColInfo(x);
                  return colStart === col && !placed.has(x.id);
                });
                if (b && d) {
                  placed.add(b.id);
                  const { span } = getBookingColInfo(b);
                  cells.push(
                    <td key={`${room.id}-${col}`} colSpan={span} className="p-1 align-top">
                      <button
                        type="button"
                        onClick={() => openEditModal(b)}
                        className="w-full text-left px-2 py-1 rounded text-xs truncate bg-teal-100 border border-teal-200 hover:bg-teal-200 block"
                      >
                        {b.guestName}
                      </button>
                    </td>,
                  );
                  col += span;
                } else {
                  cells.push(<td key={`${room.id}-${col}`} className="p-1 min-h-[36px]" />);
                  col++;
                }
              }
              return (
                <tr key={room.id} className="border-b">
                  <td className="p-2 font-medium text-sm">{room.roomNumber}</td>
                  {cells}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-4 rounded max-w-sm w-full">
            <h3 className="font-medium mb-3">{t('frontOffice.confirmChange')}</h3>
            <p className="text-sm text-slate-600 mb-3">{editBooking.booking.guestName}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">{t('frontOffice.room')}</label>
                <select
                  value={editBooking.newRoomId}
                  onChange={(e) => setEditBooking((prev) => prev ? { ...prev, newRoomId: e.target.value } : null)}
                  className="w-full px-3 py-2 border rounded text-sm"
                >
                  {sortedRooms.map((r) => (
                    <option key={r.id} value={r.id}>{r.roomNumber}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">{t('frontOffice.checkOut')}</label>
                <input
                  type="date"
                  value={editBooking.newCheckOut}
                  onChange={(e) => setEditBooking((prev) => prev ? { ...prev, newCheckOut: e.target.value } : null)}
                  className="w-full px-3 py-2 border rounded text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={applyChange} disabled={saving} className="flex-1 py-2 bg-teal-600 text-white rounded">
                {saving ? '...' : t('common.confirm')}
              </button>
              <button onClick={() => setEditBooking(null)} className="px-4 py-2 bg-slate-200 rounded">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
