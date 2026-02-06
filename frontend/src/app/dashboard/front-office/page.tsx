'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

type Room = { id: string; roomNumber: string; status: string; category: { name: string; pricePerNight: string } };
type Category = { id: string; name: string; pricePerNight: string };
type Booking = { id: string; guestName: string; room: Room; checkIn: string; checkOut: string; nights: number; totalAmount: string };

export default function FrontOfficePage() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<'rooms' | 'bookings' | 'new'>('rooms');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api<Category[]>('/hotel/categories', { token }),
      api<Room[]>('/hotel/rooms', { token }),
      api<Booking[]>('/hotel/bookings', { token }),
    ])
      .then(([c, r, b]) => {
        setCategories(c);
        setRooms(r);
        setBookings(b);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Front Office</h1>
      <div className="flex gap-2 mb-4">
        {(['rooms', 'bookings', 'new'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded ${activeTab === t ? 'bg-teal-600 text-white' : 'bg-slate-200'}`}
          >
            {t === 'new' ? 'New Booking' : t}
          </button>
        ))}
      </div>
      {activeTab === 'rooms' && (
        <div className="grid grid-cols-4 gap-2">
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
        <div className="space-y-2">
          {bookings.map((b) => (
            <div key={b.id} className="p-4 bg-white border rounded flex justify-between">
              <div>
                <div className="font-medium">{b.guestName}</div>
                <div className="text-sm">{b.room.roomNumber} · {b.nights} nights</div>
              </div>
              <div className="text-sm">
                {new Date(b.checkIn).toLocaleDateString()} - {new Date(b.checkOut).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
      {activeTab === 'new' && <NewBookingForm token={token!} categories={categories} rooms={rooms} onDone={() => setActiveTab('bookings')} />}
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
  const [roomId, setRoomId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [loading, setLoading] = useState(false);
  const vacant = rooms.filter((r) => r.status === 'VACANT');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const checkInD = new Date(checkIn);
    const checkOutD = new Date(checkOut);
    const nights = Math.ceil((checkOutD.getTime() - checkInD.getTime()) / (1000 * 60 * 60 * 24));
    setLoading(true);
    try {
      await api('/hotel/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({ roomId, guestName, guestPhone: guestPhone || undefined, checkIn, checkOut, nights }),
      });
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm mb-1">Room</label>
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="w-full px-3 py-2 border rounded" required>
          <option value="">Select room</option>
          {vacant.map((r) => (
            <option key={r.id} value={r.id}>{r.roomNumber} - {r.category.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm mb-1">Guest Name</label>
        <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className="w-full px-3 py-2 border rounded" required />
      </div>
      <div>
        <label className="block text-sm mb-1">Guest Phone</label>
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
      <button type="submit" disabled={loading} className="px-4 py-2 bg-teal-600 text-white rounded">
        Create Booking
      </button>
    </form>
  );
}
