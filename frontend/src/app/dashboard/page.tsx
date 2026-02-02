'use client';

import { useEffect, useState } from 'react';
import { api, auth } from '@/lib/api';
import { RoleGuard } from '@/components/RoleGuard';

function ExportButton({ format, label }: { format: 'excel' | 'csv'; label: string }) {
  const base = process.env.NEXT_PUBLIC_API_URL || '';
  const path = format === 'excel' ? '/api/reports/export/excel/' : '/api/reports/export/csv/';
  const handleClick = async () => {
    const token = auth.getToken();
    const res = await fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = format === 'excel' ? 'kalongo_report.xlsx' : 'charges.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" onClick={handleClick} className={format === 'excel' ? 'btn-primary' : 'btn-secondary'}>
      {label}
    </button>
  );
}

type DashboardData = {
  total_sales: number;
  sales_today: number;
  sales_this_month: number;
  total_expenses: number;
  total_salaries: number;
  net_profit: number;
  net_profit_this_month: number;
  sales_per_sector: { sector: string; label: string; total: number }[];
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardData>('/api/reports/dashboard/')
      .then(setData)
      .catch((e: { detail?: string }) => setError(e.detail || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-500">Loading dashboard…</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) return null;

  const formatMoney = (n: number) => new Intl.NumberFormat('en-TZ', { style: 'decimal', maximumFractionDigits: 0 }).format(n) + ' TZS';

  return (
    <RoleGuard permission="view_reports" fallback={<p className="text-slate-500">You do not have access to reports.</p>}>
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-8">Manager Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <p className="text-slate-500 text-sm">Sales today</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{formatMoney(data.sales_today)}</p>
          </div>
          <div className="card">
            <p className="text-slate-500 text-sm">Sales this month</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{formatMoney(data.sales_this_month)}</p>
          </div>
          <div className="card">
            <p className="text-slate-500 text-sm">Total expenses</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{formatMoney(data.total_expenses)}</p>
          </div>
          <div className="card">
            <p className="text-slate-500 text-sm">Net profit (this month)</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{formatMoney(data.net_profit_this_month)}</p>
          </div>
        </div>
        <div className="card">
          <h2 className="font-semibold text-slate-800 mb-4">Sales per sector</h2>
          <div className="flex flex-wrap gap-4">
            {data.sales_per_sector.map((s) => (
              <div key={s.sector} className="px-4 py-2 bg-slate-100 rounded-lg">
                <span className="text-slate-600">{s.label}</span>
                <span className="ml-2 font-medium">{formatMoney(s.total)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-6 flex gap-4">
          <ExportButton format="excel" label="Export Excel" />
          <ExportButton format="csv" label="Export CSV" />
        </div>
      </div>
    </RoleGuard>
  );
}
