'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Room = { id: number; number: string; room_type: number; room_type_name: string; status: string };
type RoomType = { id: number; name: string; base_price_per_night: string };
type Guest = { id: number; full_name: string; email: string; phone: string };

export default function NewBookingPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [guestId, setGuestId] = useState<number | ''>('');
  const [roomId, setRoomId] = useState<number | ''>('');
  const [roomTypeId, setRoomTypeId] = useState<number | ''>('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [source, setSource] = useState<'walk_in' | 'online'>('walk_in');
  const [specialRequests, setSpecialRequests] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Room[]>('/api/rooms/').then((r) => (Array.isArray(r) ? r : (r as { results?: Room[] }).results || [])),
      api.get<RoomType[]>('/api/room-types/').then((r) => (Array.isArray(r) ? r : (r as { results?: RoomType[] }).results || [])),
      api.get<Guest[]>('/api/guests/').then((r) => (Array.isArray(r) ? r : (r as { results?: Guest[] }).results || [])),
    ]).then(([r, rt, g]) => {
      setRooms(r);
      setRoomTypes(rt);
      setGuests(g);
    }).catch(() => setError('Failed to load'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestId || !roomId || !roomTypeId || !checkIn || !checkOut) {
      setError('Fill guest, room, room type, check-in and check-out.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/bookings/create/', {
        guest: Number(guestId),
        room: Number(roomId),
        room_type: Number(roomTypeId),
        check_in_date: checkIn,
        check_out_date: checkOut,
        source,
        special_requests: specialRequests,
      });
      router.push('/dashboard/bookings');
      router.refresh();
    } catch (err: unknown) {
      setError((err as { detail?: string }).detail || 'Create failed');
    } finally {
      setLoading(false);
    }
  };

  if (error && !guestId) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-8">New booking</h1>
      <form onSubmit={handleSubmit} className="card max-w-xl space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Guest</label>
          <select value={guestId} onChange={(e) => setGuestId(e.target.value ? Number(e.target.value) : '')} className="input" required>
            <option value="">Select guest</option>
            {guests.map((g) => (
              <option key={g.id} value={g.id}>{g.full_name} – {g.phone}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Room type</label>
          <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value ? Number(e.target.value) : '')} className="input" required>
            <option value="">Select type</option>
            {roomTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>{rt.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Room</label>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : '')} className="input" required>
            <option value="">Select room</option>
            {rooms.filter((r) => r.status === 'vacant' || r.status === 'reserved').map((r) => (
              <option key={r.id} value={r.id}>{r.number} ({r.room_type_name})</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Check-in</label>
            <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="input" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Check-out</label>
            <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="input" required />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
          <select value={source} onChange={(e) => setSource(e.target.value as 'walk_in' | 'online')} className="input">
            <option value="walk_in">Walk-in</option>
            <option value="online">Online</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Special requests</label>
          <textarea value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} className="input" rows={2} />
        </div>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Creating…' : 'Create booking'}
        </button>
      </form>
    </div>
  );
}
