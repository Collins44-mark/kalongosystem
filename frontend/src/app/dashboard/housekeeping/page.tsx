'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

type Room = { id: string; roomNumber: string; status: string; category: { name: string } };

export default function HousekeepingPage() {
  const { token } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api<Room[]>('/housekeeping/rooms', { token }).then(setRooms).finally(() => setLoading(false));
  }, [token]);

  async function updateStatus(roomId: string, status: string) {
    try {
      await api(`/housekeeping/rooms/${roomId}/status`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ status }),
      });
      setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, status } : r)));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Housekeeping</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {rooms.map((r) => (
          <div key={r.id} className="bg-white border rounded p-4">
            <div className="font-medium">{r.roomNumber}</div>
            <div className="text-sm text-slate-600">{r.category.name}</div>
            <div className="text-xs mb-2">{r.status}</div>
            <select
              value={r.status}
              onChange={(e) => updateStatus(r.id, e.target.value)}
              className="w-full text-sm px-2 py-1 border rounded"
            >
              <option value="VACANT">Vacant</option>
              <option value="OCCUPIED">Occupied</option>
              <option value="RESERVED">Reserved</option>
              <option value="UNDER_MAINTENANCE">Under Maintenance</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
