'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { RoleGuard } from '@/components/RoleGuard';

type Folio = {
  id: number;
  status: string;
  total_charges: string;
  total_payments: string;
  balance: string;
  charges: { id: number; sector: string; description: string; amount_after_tax: string }[];
  payments: { id: number; amount: string; method: string; confirmed_at: string }[];
};
type Booking = {
  id: number;
  guest_detail: { full_name: string; email: string; phone: string };
  room_number: string;
  room_type_name: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
  status_display: string;
  folio: Folio | null;
};

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<Booking>(`/api/bookings/${id}/`)
      .then(setBooking)
      .catch((e: { detail?: string }) => setError(e.detail || 'Failed'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-slate-500">Loading…</div>;
  if (error || !booking) return <div className="text-red-600">{error || 'Not found'}</div>;

  const folio = booking.folio;

  return (
    <RoleGuard permission="view_bookings" fallback={<p className="text-slate-500">No access.</p>}>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Booking #{booking.id}</h1>
          <Link href="/dashboard/bookings" className="btn-secondary">← Back to list</Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="card">
            <h2 className="font-semibold text-slate-800 mb-4">Guest & room</h2>
            <p className="font-medium text-slate-800">{booking.guest_detail?.full_name}</p>
            <p className="text-sm text-slate-500">{booking.guest_detail?.email} · {booking.guest_detail?.phone}</p>
            <p className="mt-4 text-slate-600">Room {booking.room_number} ({booking.room_type_name})</p>
            <p className="text-sm text-slate-500">{booking.check_in_date} → {booking.check_out_date}</p>
            <p className="mt-2"><span className="px-2 py-1 rounded text-xs bg-slate-200 text-slate-700">{booking.status_display}</span></p>
          </div>
          {folio && (
            <div className="card">
              <h2 className="font-semibold text-slate-800 mb-4">Folio ({folio.status})</h2>
              <p className="text-sm text-slate-600">Charges: {Number(folio.total_charges).toLocaleString()} TZS</p>
              <p className="text-sm text-slate-600">Payments: {Number(folio.total_payments).toLocaleString()} TZS</p>
              <p className="font-medium text-slate-800 mt-2">Balance: {Number(folio.balance).toLocaleString()} TZS</p>
              <ul className="mt-4 space-y-2">
                {folio.charges?.slice(0, 5).map((c) => (
                  <li key={c.id} className="text-sm">{c.sector}: {c.description} — {c.amount_after_tax} TZS</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
