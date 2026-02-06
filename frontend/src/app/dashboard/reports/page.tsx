'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

export default function ReportsPage() {
  const { token } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sales, setSales] = useState<{ bar: { total: number }; restaurant: { total: number }; hotel: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadReports() {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const data = await api<typeof sales>(`/reports/sales?${params}`, { token });
      setSales(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Reports</h1>
      <div className="flex gap-4 mb-4">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border rounded" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border rounded" />
        <button onClick={loadReports} disabled={loading} className="px-4 py-2 bg-teal-600 text-white rounded">
          Load
        </button>
      </div>
      {sales && (
        <div className="bg-white border rounded p-4">
          <h2 className="font-medium mb-2">Sales Report</h2>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>Bar: {formatTzs(sales.bar?.total ?? 0)}</div>
            <div>Restaurant: {formatTzs(sales.restaurant?.total ?? 0)}</div>
            <div>Hotel: {formatTzs(sales.hotel ?? 0)}</div>
            <div className="font-medium">Total: {formatTzs(sales.total ?? 0)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}
