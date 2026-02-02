'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { RoleGuard } from '@/components/RoleGuard';

type Guest = { id: number; full_name: string; email: string; phone: string };
type Booking = {
  id: number;
  guest: number;
  guest_detail: Guest;
  room: number;
  room_number: string;
  room_type_name: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
  status_display: string;
  source: string;
};

export default function BookingsPage() {
  const [list, setList] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Booking[] | { results?: Booking[] }>('/api/bookings/')
      .then((r) => setList(Array.isArray(r) ? r : (r.results || [])))
      .catch((e: { detail?: string }) => setError(e.detail || 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  const checkIn = async (id: number) => {
    try {
      await api.post(`/api/bookings/${id}/check-in/`);
      setList((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'checked_in', status_display: 'Checked In' } : b)));
    } catch (e) {
      alert((e as { detail?: string }).detail || 'Check-in failed');
    }
  };

  if (loading) return <div className="text-slate-500">Loading…</div>;
  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <RoleGuard permission="view_bookings" fallback={<p className="text-slate-500">No access.</p>}>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Bookings & Check-in</h1>
          <RoleGuard permission="create_booking">
            <Link href="/dashboard/bookings/new" className="btn-primary">
              New booking
            </Link>
          </RoleGuard>
        </div>
        <div className="card overflow-hidden p-0">
          <table className="w-full text-left">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-sm font-medium text-slate-700">Guest</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-700">Room</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-700">Check-in / Out</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-700">Status</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id} className="border-b border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{b.guest_detail?.full_name || b.guest}</p>
                    <p className="text-sm text-slate-500">{b.guest_detail?.phone}</p>
                  </td>
                  <td className="px-4 py-3">{b.room_number} ({b.room_type_name})</td>
                  <td className="px-4 py-3 text-sm">{b.check_in_date} → {b.check_out_date}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded text-xs bg-slate-200 text-slate-700">{b.status_display}</span>
                  </td>
                  <td className="px-4 py-3">
                    {(b.status === 'pending' || b.status === 'confirmed') && (
                      <RoleGuard permission="create_booking">
                        <button type="button" onClick={() => checkIn(b.id)} className="btn-primary text-sm mr-2">
                          Check-in
                        </button>
                      </RoleGuard>
                    )}
                    <Link href={`/dashboard/bookings/${b.id}`} className="text-primary-600 text-sm hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && (
            <p className="p-8 text-center text-slate-500">No bookings yet.</p>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
