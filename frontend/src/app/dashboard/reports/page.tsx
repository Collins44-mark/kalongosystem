'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { isManagerLevel } from '@/lib/roles';

type ReportType = 'revenue' | 'expenses' | 'pnl';
type Sector = 'all' | 'bar' | 'restaurant' | 'hotel';
type PeriodPreset = 'day' | 'week' | 'month' | 'bydate';

function toLocalDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('day');
  const [from, setFrom] = useState(() => toLocalDate(new Date()));
  const [to, setTo] = useState(() => toLocalDate(new Date()));
  const [sector, setSector] = useState<Sector>('all');
  const [reportType, setReportType] = useState<ReportType>('revenue');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const canView = isManagerLevel(user?.role) || user?.role === 'FINANCE';

  const dateRange = useMemo(() => {
    const now = new Date();
    const today = toLocalDate(now);
    if (periodPreset === 'day') return { from: today, to: today };
    if (periodPreset === 'week') {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { from: toLocalDate(start), to: today };
    }
    if (periodPreset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toLocalDate(start), to: today };
    }
    return { from, to };
  }, [periodPreset, from, to]);

  async function loadReport() {
    if (!token || !canView) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('from', dateRange.from);
      params.set('to', dateRange.to);
      if (reportType === 'revenue') {
        const res = await api<{ bar?: { total?: number }; restaurant?: { total?: number }; hotel?: number; total?: number }>(`/reports/sales?${params}`, { token });
        if (sector !== 'all') {
          const bar = (res.bar as { total?: number })?.total ?? 0;
          const restaurant = (res.restaurant as { total?: number })?.total ?? 0;
          const hotel = (res.hotel as number) ?? 0;
          const filtered =
            sector === 'bar'
              ? { bar: res.bar, restaurant: { total: 0 }, hotel: 0, total: bar }
              : sector === 'restaurant'
                ? { bar: { total: 0 }, restaurant: res.restaurant, hotel: 0, total: restaurant }
                : { bar: { total: 0 }, restaurant: { total: 0 }, hotel, total: hotel };
          setData(filtered as unknown as Record<string, unknown>);
        } else {
          setData(res as unknown as Record<string, unknown>);
        }
      } else if (reportType === 'expenses') {
        const res = await api<{ expenses: unknown[]; total?: number }>(`/finance/expenses?${params}`, { token });
        setData(res as unknown as Record<string, unknown>);
      } else {
        const res = await api<{ totalRevenue?: number; totalExpenses?: number; netProfit?: number }>(`/finance/dashboard?${params}`, { token });
        setData(res as unknown as Record<string, unknown>);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function download(format: 'csv' | 'xlsx' | 'pdf') {
    if (!token) return;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const params = new URLSearchParams();
    params.set('reportType', reportType);
    params.set('format', format);
    params.set('from', dateRange.from);
    params.set('to', dateRange.to);
    if (reportType === 'revenue') params.set('sector', sector);

    const res = await fetch(`${baseUrl}/reports/export?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    if (!res.ok) return;

    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const match = cd.match(/filename="([^"]+)"/i);
    const filename = match?.[1] || `report-${reportType}-${new Date().toISOString().slice(0, 10)}.${format}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!canView) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-4">{t('reports.title')}</h1>
        <p className="text-slate-600">{t('reports.onlyManagers')}</p>
      </div>
    );
  }

  function setPresetAndDates(preset: PeriodPreset) {
    setPeriodPreset(preset);
    const now = new Date();
    const today = toLocalDate(now);
    if (preset === 'day') {
      setFrom(today);
      setTo(today);
    } else if (preset === 'week') {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      setFrom(toLocalDate(start));
      setTo(today);
    } else if (preset === 'month') {
      setFrom(toLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)));
      setTo(today);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-xl font-semibold">{t('reports.title')}</h1>

      <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-slate-600 py-1.5">{t('reports.period')}:</span>
          {(['day', 'week', 'month', 'bydate'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => p === 'bydate' ? setPeriodPreset('bydate') : setPresetAndDates(p)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                periodPreset === p ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {p === 'day' ? t('reports.today') : p === 'week' ? t('reports.thisWeek') : p === 'month' ? t('reports.thisMonth') : t('reports.byDate')}
            </button>
          ))}
        </div>
        {periodPreset === 'bydate' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1">{t('finance.date')} from</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">{t('common.to')}</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {reportType === 'revenue' && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">{t('reports.sector')}</label>
              <select value={sector} onChange={(e) => setSector(e.target.value as Sector)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                <option value="all">All</option>
                <option value="bar">{t('bar.title')}</option>
                <option value="restaurant">{t('restaurant.title')}</option>
                <option value="hotel">{t('overview.hotelRooms')}</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('reports.reportType')}</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
              <option value="revenue">{t('reports.revenue')}</option>
              <option value="expenses">{t('reports.expenses')}</option>
              <option value="pnl">{t('reports.pnl')}</option>
            </select>
          </div>
        </div>
        <button onClick={loadReport} disabled={loading} className="px-5 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
          {loading ? t('common.loading') : t('reports.load')}
        </button>
      </div>

      {data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 bg-white border rounded-xl p-4 shadow-sm">
            <span className="text-sm text-slate-600">{t('reports.download')}:</span>
            <button onClick={() => download('csv')} className="px-4 py-2 text-sm bg-slate-100 rounded-lg hover:bg-slate-200 font-medium">
              {t('reports.exportCsv')}
            </button>
            <button onClick={() => download('xlsx')} className="px-4 py-2 text-sm bg-slate-100 rounded-lg hover:bg-slate-200 font-medium">
              {t('reports.exportExcel')}
            </button>
            <button onClick={() => download('pdf')} className="px-4 py-2 text-sm bg-slate-100 rounded-lg hover:bg-slate-200 font-medium">
              {t('reports.exportPdf')}
            </button>
          </div>

          {reportType === 'revenue' && (
            <div className="bg-white border rounded-xl p-5 shadow-sm min-w-0">
              <h2 className="font-semibold text-slate-800 mb-4">{t('reports.revenue')} {t('reports.title')}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div className="p-3 bg-slate-50 rounded-lg"><span className="text-slate-600">Bar</span><div className="font-semibold mt-0.5">{formatTzs((data.bar as { total?: number })?.total ?? 0)}</div></div>
                <div className="p-3 bg-slate-50 rounded-lg"><span className="text-slate-600">Restaurant</span><div className="font-semibold mt-0.5">{formatTzs((data.restaurant as { total?: number })?.total ?? 0)}</div></div>
                <div className="p-3 bg-slate-50 rounded-lg"><span className="text-slate-600">Hotel</span><div className="font-semibold mt-0.5">{formatTzs((data.hotel as number) ?? 0)}</div></div>
                <div className="p-3 bg-teal-50 rounded-lg"><span className="text-slate-600">Total</span><div className="font-semibold text-teal-800 mt-0.5">{formatTzs((data.total as number) ?? 0)}</div></div>
              </div>
            </div>
          )}
          {reportType === 'expenses' && (
            <div className="bg-white border rounded-xl p-5 shadow-sm min-w-0">
              <h2 className="font-semibold text-slate-800 mb-4">{t('reports.expenses')} {t('reports.title')}</h2>
              <p className="text-lg font-semibold">{formatTzs((data.total as number) ?? 0)}</p>
              <p className="text-sm text-slate-600 mt-1">{(data.expenses as unknown[])?.length ?? 0} expense(s)</p>
            </div>
          )}
          {reportType === 'pnl' && (
            <div className="bg-white border rounded-xl p-5 shadow-sm min-w-0">
              <h2 className="font-semibold text-slate-800 mb-4">P&L {t('reports.title')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div className="p-3 bg-slate-50 rounded-lg"><span className="text-slate-600">Revenue</span><div className="font-semibold mt-0.5">{formatTzs((data.totalRevenue as number) ?? 0)}</div></div>
                <div className="p-3 bg-slate-50 rounded-lg"><span className="text-slate-600">Expenses</span><div className="font-semibold mt-0.5">{formatTzs((data.totalExpenses as number) ?? 0)}</div></div>
                <div className={`p-3 rounded-lg ${((data.netProfit as number) ?? 0) >= 0 ? 'bg-green-50' : 'bg-red-50'}`}><span className="text-slate-600">Net Profit</span><div className={`font-semibold mt-0.5 ${((data.netProfit as number) ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatTzs((data.netProfit as number) ?? 0)}</div></div>
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
