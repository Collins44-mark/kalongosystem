'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

type Booking = {
  id: number;
  guest_detail: { full_name: string; email: string; phone: string };
  room_number: string;
  room_type_name: string;
  check_in_date: string;
  check_out_date: string;
};

export default function QRCheckInPage() {
  const params = useParams();
  const token = params?.token as string;
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', id_type: '', id_number: '', nationality: '' });

  useEffect(() => {
    if (!token) return;
    const base = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${base}/api/qr/${token}/`)
      .then((r) => r.json())
      .then((data) => {
        setBooking(data);
        setForm({
          full_name: data.guest_detail?.full_name || '',
          email: data.guest_detail?.email || '',
          phone: data.guest_detail?.phone || '',
          id_type: '',
          id_number: '',
          nationality: '',
        });
      })
      .catch(() => setError('Invalid or expired link'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const base = process.env.NEXT_PUBLIC_API_URL || '';
    const res = await fetch(`${base}/api/qr/${token}/submit/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSubmitted(true);
    } else {
      setError(data.detail || 'Submission failed');
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  if (error && !booking) return <div className="min-h-screen flex items-center justify-center text-red-600">{error}</div>;
  if (submitted) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
        <div className="card max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-800 mb-2">Check-in form submitted</h1>
          <p className="text-slate-600">Reception will approve your check-in shortly. You can close this page.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
      <div className="card max-w-md w-full">
        <h1 className="text-xl font-bold text-slate-800 mb-1">Kalongo Hotel – Self check-in</h1>
        {booking && (
          <p className="text-slate-600 text-sm mb-6">
            Room {booking.room_number} ({booking.room_type_name}) · {booking.check_in_date} → {booking.check_out_date}
          </p>
        )}
        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full name</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ID type</label>
            <input type="text" value={form.id_type} onChange={(e) => setForm((f) => ({ ...f, id_type: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ID number</label>
            <input type="text" value={form.id_number} onChange={(e) => setForm((f) => ({ ...f, id_number: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nationality</label>
            <input type="text" value={form.nationality} onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))} className="input" />
          </div>
          <button type="submit" className="btn-primary w-full">Submit check-in form</button>
        </form>
      </div>
    </main>
  );
}
