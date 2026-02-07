'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

type Room = { id: string; roomNumber: string; status: string; category: { id: string; name: string; pricePerNight: string } };
type Category = { id: string; name: string; pricePerNight: string };
type Booking = {
  id: string;
  guestName: string;
  guestPhone?: string;
  room: Room;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: string;
  status: string;
  folioNumber?: string;
  servedBy?: string;
};

export default function FrontOfficePage() {
  const { token, user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<string>('rooms');
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'all' | 'today' | 'mine'>('all');

  const isManager = user?.role === 'MANAGER' || user?.role === 'ADMIN';

  const managerTabs = [
    { id: 'rooms', label: 'Room Availability' },
    { id: 'bookings', label: 'All Bookings' },
    { id: 'history', label: 'Booking History' },
    { id: 'new', label: 'New Booking' },
    { id: 'folios', label: 'Active Folios' },
  ];
  const staffTabs = [
    { id: 'rooms', label: 'Rooms' },
    { id: 'bookings', label: "Today's Bookings" },
    { id: 'new', label: 'Create Booking' },
    { id: 'folios', label: 'Active Folios' },
  ];
  const tabs = isManager ? managerTabs : staffTabs;

  useEffect(() => {
    if (!token) return;
    const bookingScope = activeTab === 'history' ? 'all' : isManager ? scope : 'today';
    Promise.all([
      api<Category[]>('/hotel/categories', { token }).catch(() => []),
      api<Room[]>('/hotel/rooms', { token }).catch(() => []),
      api<Booking[]>(`/hotel/bookings?scope=${bookingScope}`, { token }).catch(() => []),
    ])
      .then(([c, r, b]) => {
        setCategories(c);
        setRooms(r);
        setBookings(b);
      })
      .finally(() => setLoading(false));
  }, [token, isManager, scope, activeTab]);

  function refresh() {
    if (!token) return;
    const bookingScope = activeTab === 'history' ? 'all' : isManager ? scope : 'today';
    api<Booking[]>(`/hotel/bookings?scope=${bookingScope}`, { token })
      .then(setBookings)
      .catch(() => {});
    api<Room[]>('/hotel/rooms', { token }).then(setRooms).catch(() => {});
  }

  if (loading) return <div className="text-slate-500">Loading...</div>;

  const activeFolios = bookings.filter((b) => b.status === 'CHECKED_IN');
  const historyBookings = isManager ? bookings.filter((b) => b.status === 'CHECKED_OUT' || b.status === 'CANCELLED') : [];
  const todayBookings = isManager && scope === 'all' ? bookings : bookings;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Front Office</h1>
      {isManager && (
        <p className="text-sm text-slate-500 mb-2">Supervisory view — all features and controls</p>
      )}
      {!isManager && (
        <p className="text-sm text-slate-500 mb-2">Operational view — today&apos;s tasks only</p>
      )}

      {isManager && activeTab === 'bookings' && (
        <div className="flex gap-2 mb-4">
          {(['all', 'today', 'mine'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1 rounded text-sm ${scope === s ? 'bg-teal-600 text-white' : 'bg-slate-200'}`}
            >
              {s === 'all' ? 'All' : s === 'today' ? "Today" : 'My Bookings'}
            </button>
          ))}
          <button onClick={refresh} className="px-3 py-1 text-sm text-teal-600 hover:underline">Refresh</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded ${activeTab === t.id ? 'bg-teal-600 text-white' : 'bg-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'rooms' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {rooms.map((r) => (
            <div
              key={r.id}
              className={`p-4 rounded border ${
                r.status === 'VACANT'
                  ? 'bg-green-50 border-green-200'
                  : r.status === 'OCCUPIED'
                  ? 'bg-amber-50 border-amber-200'
                  : r.status === 'RESERVED'
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="font-medium">{r.roomNumber}</div>
              <div className="text-sm text-slate-600">{r.category.name}</div>
              <div className="text-xs">{r.status}</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'bookings' && (
        <BookingList
          bookings={todayBookings}
          token={token!}
          isManager={isManager}
          rooms={rooms}
          onAction={refresh}
        />
      )}

      {activeTab === 'history' && isManager && (
        <BookingList
          bookings={historyBookings}
          token={token!}
          isManager={true}
          rooms={rooms}
          onAction={refresh}
          readOnly
        />
      )}

      {activeTab === 'new' && (
        <NewBookingForm
          token={token!}
          categories={categories}
          rooms={rooms}
          onDone={() => { setActiveTab(isManager ? 'bookings' : 'bookings'); refresh(); }}
        />
      )}

      {activeTab === 'folios' && (
        <FolioList
          folios={activeFolios}
          token={token!}
          isManager={isManager}
          rooms={rooms}
          onAction={refresh}
        />
      )}
    </div>
  );
}

function BookingList({
  bookings,
  token,
  isManager,
  rooms,
  onAction,
  readOnly = false,
}: {
  bookings: Booking[];
  token: string;
  isManager: boolean;
  rooms: Room[];
  onAction: () => void;
  readOnly?: boolean;
}) {
  const vacantRooms = rooms.filter((r) => r.status === 'VACANT');

  async function checkIn(id: string) {
    try {
      await api(`/hotel/bookings/${id}/check-in`, { method: 'POST', token });
      onAction();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function checkOut(id: string) {
    try {
      await api(`/hotel/bookings/${id}/check-out`, { method: 'POST', token });
      onAction();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function cancel(id: string) {
    if (!confirm('Cancel this booking?')) return;
    try {
      await api(`/hotel/bookings/${id}/cancel`, { method: 'POST', token });
      onAction();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function changeRoom(bookingId: string, roomId: string) {
    try {
      await api(`/hotel/bookings/${bookingId}/room`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ roomId }),
      });
      onAction();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function overrideStatus(bookingId: string, status: string) {
    try {
      await api(`/hotel/bookings/${bookingId}/status`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ status }),
      });
      onAction();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="space-y-2">
      {bookings.map((b) => (
        <div key={b.id} className="p-4 bg-white border rounded flex flex-wrap justify-between items-center gap-2">
          <div>
            <div className="font-medium">{b.guestName}</div>
            <div className="text-sm text-slate-600">
              {b.room.roomNumber} · {b.nights} nights · {b.status}
            </div>
            <div className="text-xs text-slate-500">
              {new Date(b.checkIn).toLocaleDateString()} - {new Date(b.checkOut).toLocaleDateString()}
              {b.servedBy && ` · Served by: ${b.servedBy}`}
            </div>
          </div>
          <div className="text-sm font-medium">{formatTzs(parseFloat(b.totalAmount))}</div>
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              {b.status === 'CONFIRMED' && (
                <button onClick={() => checkIn(b.id)} className="px-3 py-1 bg-green-600 text-white rounded text-sm">
                  Check-in
                </button>
              )}
              {b.status === 'CHECKED_IN' && (
                <>
                  <button onClick={() => checkOut(b.id)} className="px-3 py-1 bg-teal-600 text-white rounded text-sm">
                    Check-out
                  </button>
                  <ExtendStayModal booking={b} token={token} onDone={onAction} />
                </>
              )}
              {isManager && (b.status === 'CONFIRMED' || b.status === 'RESERVED') && (
                <button onClick={() => cancel(b.id)} className="px-3 py-1 bg-red-600 text-white rounded text-sm">
                  Cancel
                </button>
              )}
              {isManager && (
                <select
                  value=""
                  onChange={(e) => { const v = e.target.value; if (v) overrideStatus(b.id, v); e.target.value = ''; }}
                  className="px-2 py-1 border rounded text-sm"
                >
                  <option value="">Override status</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="CHECKED_IN">Checked In</option>
                  <option value="CHECKED_OUT">Checked Out</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              )}
              {(b.status === 'CONFIRMED' || b.status === 'CHECKED_IN') && vacantRooms.length > 0 && (
                <select
                  value=""
                  onChange={(e) => { const v = e.target.value; if (v) changeRoom(b.id, v); e.target.value = ''; }}
                  className="px-2 py-1 border rounded text-sm"
                >
                  <option value="">Change room</option>
                  {vacantRooms.filter((r) => r.id !== b.room.id).map((r) => (
                    <option key={r.id} value={r.id}>{r.roomNumber}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      ))}
      {bookings.length === 0 && <p className="text-slate-500">No bookings</p>}
    </div>
  );
}

function ExtendStayModal({ booking, token, onDone }: { booking: Booking; token: string; onDone: () => void }) {
  const [show, setShow] = useState(false);
  const [checkOut, setCheckOut] = useState(booking.checkOut.slice(0, 10));
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      await api(`/hotel/bookings/${booking.id}/extend`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ checkOut }),
      });
      setShow(false);
      onDone();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button onClick={() => setShow(true)} className="px-3 py-1 bg-amber-600 text-white rounded text-sm">
        Extend
      </button>
      {show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded max-w-sm w-full">
            <h3 className="font-medium mb-2">Extend Stay</h3>
            <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full px-3 py-2 border rounded mb-2" />
            <div className="flex gap-2">
              <button onClick={submit} disabled={loading} className="px-4 py-2 bg-teal-600 text-white rounded">Extend</button>
              <button onClick={() => setShow(false)} className="px-4 py-2 bg-slate-200 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FolioList({
  folios,
  token,
  isManager,
  rooms,
  onAction,
}: {
  folios: Booking[];
  token: string;
  isManager: boolean;
  rooms: Room[];
  onAction: () => void;
}) {
  const vacantRooms = rooms.filter((r) => r.status === 'VACANT');

  async function checkOut(id: string) {
    try {
      await api(`/hotel/bookings/${id}/check-out`, { method: 'POST', token });
      onAction();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function changeRoom(bookingId: string, roomId: string) {
    try {
      await api(`/hotel/bookings/${bookingId}/room`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ roomId }),
      });
      onAction();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Active folios are checked-in bookings. View details and manage stay.</p>
      {folios.map((b) => (
        <div key={b.id} className="p-4 bg-white border rounded">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="font-medium">{b.guestName} {b.guestPhone && `· ${b.guestPhone}`}</div>
              <div className="text-sm text-slate-600">Room {b.room.roomNumber} · {b.room.category?.name}</div>
              <div className="text-xs text-slate-500">
                {new Date(b.checkIn).toLocaleDateString()} - {new Date(b.checkOut).toLocaleDateString()} · {b.folioNumber ?? b.id}
                {b.servedBy && ` · Served by: ${b.servedBy}`}
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold">{formatTzs(parseFloat(b.totalAmount))}</div>
              <div className="text-xs text-slate-500">Balance (read-only)</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t">
            <button onClick={() => checkOut(b.id)} className="px-3 py-1 bg-teal-600 text-white rounded text-sm">
              Check-out
            </button>
            <ExtendStayModal booking={b} token={token} onDone={onAction} />
            {vacantRooms.length > 0 && (
              <select
                value=""
                onChange={(e) => { const v = e.target.value; if (v) changeRoom(b.id, v); e.target.value = ''; }}
                className="px-2 py-1 border rounded text-sm"
              >
                <option value="">Change room</option>
                {vacantRooms.filter((r) => r.id !== b.room.id).map((r) => (
                  <option key={r.id} value={r.id}>{r.roomNumber}</option>
                ))}
              </select>
            )}
            {isManager && <span className="text-xs text-slate-400 px-2">View payments (read-only) — coming soon</span>}
          </div>
        </div>
      ))}
      {folios.length === 0 && <p className="text-slate-500">No active folios</p>}
    </div>
  );
}

function NewBookingForm({
  token,
  categories,
  rooms,
  onDone,
}: {
  token: string;
  categories: Category[];
  rooms: Room[];
  onDone: () => void;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [loading, setLoading] = useState(false);

  const category = categories.find((c) => c.id === categoryId);
  const availableRooms = categoryId
    ? rooms.filter((r) => r.category.id === categoryId && r.status === 'VACANT')
    : [];
  const room = roomId ? availableRooms.find((r) => r.id === roomId) : null;
  const nights = checkIn && checkOut
    ? Math.max(0, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const pricePerNight = room ? parseFloat(room.category.pricePerNight) : category ? parseFloat(category.pricePerNight) : 0;
  const total = nights * pricePerNight;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!roomId || nights < 1) return;
    setLoading(true);
    try {
      await api('/hotel/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          roomId,
          guestName,
          guestPhone: guestPhone || undefined,
          checkIn,
          checkOut,
          nights,
        }),
      });
      onDone();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm mb-1">Room Category</label>
        <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setRoomId(''); }} className="w-full px-3 py-2 border rounded" required>
          <option value="">Select category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name} — {formatTzs(parseFloat(c.pricePerNight))}/night</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm mb-1">Room</label>
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="w-full px-3 py-2 border rounded" required disabled={!categoryId}>
          <option value="">Select room</option>
          {availableRooms.map((r) => (
            <option key={r.id} value={r.id}>{r.roomNumber} - {r.category.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm mb-1">Guest Name</label>
        <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className="w-full px-3 py-2 border rounded" required />
      </div>
      <div>
        <label className="block text-sm mb-1">Phone / ID (optional)</label>
        <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} className="w-full px-3 py-2 border rounded" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">Check-in</label>
          <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="w-full px-3 py-2 border rounded" required />
        </div>
        <div>
          <label className="block text-sm mb-1">Check-out</label>
          <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full px-3 py-2 border rounded" required />
        </div>
      </div>
      <div className="p-3 bg-slate-50 rounded text-sm">
        <div>Nights: {nights}</div>
        <div>Price/night: {formatTzs(pricePerNight)}</div>
        <div className="font-medium">Total: {formatTzs(total)}</div>
      </div>
      <button type="submit" disabled={loading} className="px-4 py-2 bg-teal-600 text-white rounded">
        Create Booking
      </button>
    </form>
  );
}

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}
