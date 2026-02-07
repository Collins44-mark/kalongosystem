'use client';

import { useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';

type ReportType = 'revenue' | 'expenses' | 'pnl';
type Sector = 'all' | 'bar' | 'restaurant' | 'hotel';

export default function ReportsPage() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sector, setSector] = useState<Sector>('all');
  const [reportType, setReportType] = useState<ReportType>('revenue');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const isManager = user?.role === 'MANAGER' || user?.role === 'ADMIN';

  async function loadReport() {
    if (!token || !isManager) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (reportType === 'revenue') {
        const res = await api<{ bar?: { total?: number }; restaurant?: { total?: number }; hotel?: number; total?: number }>(`/reports/sales?${params}`, { token });
        setData(res);
      } else if (reportType === 'expenses') {
        const res = await api<{ expenses: unknown[]; total?: number }>(`/finance/expenses?${params}`, { token });
        setData(res);
      } else {
        const res = await api<{ totalRevenue?: number; totalExpenses?: number; netProfit?: number }>(`/finance/dashboard?${params}`, { token });
        setData(res);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!data) return;
    let csv = '';
    if (reportType === 'revenue' && data.bar !== undefined) {
      csv = 'Sector,Amount (TZS)\n';
      csv += `Bar,${(data.bar as { total?: number }).total ?? 0}\n`;
      csv += `Restaurant,${(data.restaurant as { total?: number })?.total ?? 0}\n`;
      csv += `Hotel,${(data.hotel as number) ?? 0}\n`;
      csv += `Total,${(data.total as number) ?? 0}\n`;
    } else if (reportType === 'pnl') {
      csv = 'Item,Amount (TZS)\n';
      csv += `Revenue,${(data.totalRevenue as number) ?? 0}\n`;
      csv += `Expenses,${(data.totalExpenses as number) ?? 0}\n`;
      csv += `Net Profit,${(data.netProfit as number) ?? 0}\n`;
    }
    if (csv) {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  if (!isManager) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-4">{t('reports.title')}</h1>
        <p className="text-slate-600">{t('reports.onlyManagers')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('reports.title')}</h1>

      <div className="bg-white border rounded p-4 space-y-4 max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('finance.date')} from</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('finance.date')} {t('common.to')}</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">{t('reports.sector')}</label>
          <select value={sector} onChange={(e) => setSector(e.target.value as Sector)} className="w-full px-3 py-2 border rounded">
            <option value="all">All</option>
            <option value="bar">{t('bar.title')}</option>
            <option value="restaurant">{t('restaurant.title')}</option>
            <option value="hotel">{t('overview.hotelRooms')}</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Report type</label>
          <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} className="w-full px-3 py-2 border rounded">
            <option value="revenue">{t('reports.revenue')}</option>
            <option value="expenses">{t('reports.expenses')}</option>
            <option value="pnl">{t('reports.pnl')}</option>
          </select>
        </div>
        <button onClick={loadReport} disabled={loading} className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">
          {loading ? t('common.loading') : t('reports.load')}
        </button>
      </div>

      {data && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={exportCsv} className="px-3 py-1 text-sm bg-slate-100 rounded hover:bg-slate-200">
              {t('reports.exportCsv')}
            </button>
            <span className="px-3 py-1 text-sm text-slate-400">PDF, Excel, Email, WhatsApp – coming soon</span>
          </div>

          {reportType === 'revenue' && (
            <div className="bg-white border rounded p-4">
              <h2 className="font-medium mb-2">Revenue Report</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>Bar: {formatTzs((data.bar as { total?: number })?.total ?? 0)}</div>
                <div>Restaurant: {formatTzs((data.restaurant as { total?: number })?.total ?? 0)}</div>
                <div>Hotel: {formatTzs((data.hotel as number) ?? 0)}</div>
                <div className="font-medium">Total: {formatTzs((data.total as number) ?? 0)}</div>
              </div>
            </div>
          )}
          {reportType === 'expenses' && (
            <div className="bg-white border rounded p-4">
              <h2 className="font-medium mb-2">Expenses Report</h2>
              <p className="text-sm">Total: {formatTzs((data.total as number) ?? 0)}</p>
              <div className="mt-2 text-sm text-slate-600">
                {(data.expenses as unknown[])?.length ?? 0} expense(s)
              </div>
            </div>
          )}
          {reportType === 'pnl' && (
            <div className="bg-white border rounded p-4">
              <h2 className="font-medium mb-2">P&L Report</h2>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>Revenue: {formatTzs((data.totalRevenue as number) ?? 0)}</div>
                <div>Expenses: {formatTzs((data.totalExpenses as number) ?? 0)}</div>
                <div className={`font-medium ${((data.netProfit as number) ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Net Profit: {formatTzs((data.netProfit as number) ?? 0)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}
