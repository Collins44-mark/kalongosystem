'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

type Dashboard = {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  bySector: { bar: number; restaurant: number; hotel: number };
  expenses: { id: string; category: string; amount: string; expenseDate: string }[];
};

export default function FinancePage() {
  const { token } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const empty: Dashboard = {
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
      bySector: { bar: 0, restaurant: 0, hotel: 0 },
      expenses: [],
    };
    api<Dashboard>(`/finance/dashboard?${params}`, { token })
      .then(setData)
      .catch(() => setData(empty))
      .finally(() => setLoading(false));
  }, [token, from, to]);

  if (loading) return <div>Loading...</div>;
  const displayData = data ?? {
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    bySector: { bar: 0, restaurant: 0, hotel: 0 },
    expenses: [],
  };

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Finance</h1>
      <div className="flex gap-4 mb-4">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border rounded" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border rounded" />
      </div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border rounded p-4">
          <div className="text-sm text-slate-500">Revenue</div>
          <div className="text-xl font-semibold">{formatTzs(displayData.totalRevenue)}</div>
        </div>
        <div className="bg-white border rounded p-4">
          <div className="text-sm text-slate-500">Expenses</div>
          <div className="text-xl font-semibold">{formatTzs(displayData.totalExpenses)}</div>
        </div>
        <div className="bg-white border rounded p-4">
          <div className="text-sm text-slate-500">Net Profit</div>
          <div className={`text-xl font-semibold ${displayData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatTzs(displayData.netProfit)}
          </div>
        </div>
      </div>
      <div className="bg-white border rounded p-4 mb-4">
        <h2 className="font-medium mb-2">By Sector</h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>Bar: {formatTzs(displayData.bySector.bar)}</div>
          <div>Restaurant: {formatTzs(displayData.bySector.restaurant)}</div>
          <div>Hotel: {formatTzs(displayData.bySector.hotel)}</div>
        </div>
      </div>
      <div className="bg-white border rounded p-4">
        <h2 className="font-medium mb-2">Recent Expenses</h2>
        <div className="space-y-2">
          {displayData.expenses.slice(0, 10).map((e) => (
            <div key={e.id} className="flex justify-between text-sm">
              <span>{e.category} - {new Date(e.expenseDate).toLocaleDateString()}</span>
              <span>{formatTzs(parseFloat(e.amount))}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}
