'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RoleGuard } from '@/components/RoleGuard';

type Maintenance = { id: number; room: number; room_number: string; description: string; priority: string; status: string; created_at: string };
type Housekeeping = { id: number; room: number | null; description: string; status: string; created_at: string };

export default function HousekeepingPage() {
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [housekeeping, setHousekeeping] = useState<Housekeeping[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDesc, setNewDesc] = useState('');
  const [newRoomId, setNewRoomId] = useState<string>('');
  const [rooms, setRooms] = useState<{ id: number; number: string }[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<Maintenance[] | { results: Maintenance[] }>('/api/maintenance/').then((r) => Array.isArray(r) ? r : (r.results || [])),
      api.get<Housekeeping[] | { results: Housekeeping[] }>('/api/housekeeping/').then((r) => Array.isArray(r) ? r : (r.results || [])),
      api.get<{ id: number; number: string }[] | { results: { id: number; number: string }[] }>('/api/rooms/').then((r) => Array.isArray(r) ? r : (r.results || [])),
    ]).then(([m, h, r]) => {
      setMaintenance(m);
      setHousekeeping(h);
      setRooms(r);
    }).finally(() => setLoading(false));
  }, []);

  const addHousekeeping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDesc.trim()) return;
    try {
      await api.post('/api/housekeeping/', { description: newDesc.trim(), room: newRoomId ? Number(newRoomId) : null });
      const list = await api.get<Housekeeping[] | { results: Housekeeping[] }>('/api/housekeeping/');
      setHousekeeping(Array.isArray(list) ? list : (list.results || []));
      setNewDesc('');
      setNewRoomId('');
    } catch (e) {
      alert((e as { detail?: string }).detail || 'Failed');
    }
  };

  if (loading) return <div className="text-slate-500">Loading…</div>;

  return (
    <RoleGuard permission="view_housekeeping" fallback={<p className="text-slate-500">No access.</p>}>
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-8">Housekeeping & Maintenance</h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="card">
            <h2 className="font-semibold text-slate-800 mb-4">Maintenance requests</h2>
            <ul className="space-y-3">
              {maintenance.map((m) => (
                <li key={m.id} className="flex justify-between items-start p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-800">Room {m.room_number}</p>
                    <p className="text-sm text-slate-600">{m.description}</p>
                    <p className="text-xs text-slate-500">{m.priority} · {m.status}</p>
                  </div>
                  <span className="text-xs text-slate-500">{new Date(m.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
            {maintenance.length === 0 && <p className="text-slate-500 text-sm">No maintenance requests.</p>}
          </div>
          <div className="card">
            <h2 className="font-semibold text-slate-800 mb-4">Housekeeping / supply requests</h2>
            <form onSubmit={addHousekeeping} className="flex gap-2 mb-4">
              <select value={newRoomId} onChange={(e) => setNewRoomId(e.target.value)} className="input flex-1 max-w-[120px]">
                <option value="">—</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.number}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Description"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="input flex-1"
              />
              <button type="submit" className="btn-primary">Add</button>
            </form>
            <ul className="space-y-2">
              {housekeeping.map((h) => (
                <li key={h.id} className="text-sm p-2 bg-slate-50 rounded">
                  {h.room ? `Room ${h.room}` : '—'} · {h.description} · {h.status}
                </li>
              ))}
            </ul>
            {housekeeping.length === 0 && <p className="text-slate-500 text-sm">No requests.</p>}
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
