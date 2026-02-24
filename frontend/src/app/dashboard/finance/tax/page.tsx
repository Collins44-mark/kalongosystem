'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { isManagerLevel } from '@/lib/roles';

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type Period = 'today' | 'week' | 'month' | 'bydate';
type Overview = {
  vat: { vat_enabled: boolean; vat_rate: number; vat_type: 'inclusive' | 'exclusive' };
  totals: { grossSales: number; netRevenue: number; vatCollected: number };
  bySector: {
    rooms: { gross: number; net: number; vat: number };
    bar: { gross: number; net: number; vat: number };
    restaurant: { gross: number; net: number; vat: number };
    other: { gross: number; net: number; vat: number };
  };
};

export default function FinanceTaxPage() {
  const router = useRouter();
  const { token, user } = useAuth();
  const { t } = useTranslation();

  const isManager = isManagerLevel(user?.role);
  const isFinance = user?.role === 'FINANCE';
  const canAccess = isManager || isFinance;

  const [period, setPeriod] = useState<Period>('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (period === 'bydate' && dateFrom && dateTo) {
      return { from: dateFrom, to: dateTo };
    }
    if (period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toLocalDateString(start), to: toLocalDateString(now) };
    }
    if (period === 'week') {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { from: toLocalDateString(start), to: toLocalDateString(now) };
    }
    return { from: toLocalDateString(now), to: toLocalDateString(now) };
  }, [period, dateFrom, dateTo]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('period', period);
    if (period === 'bydate' && dateFrom && dateTo) {
      params.set('from', dateFrom);
      params.set('to', dateTo);
    }
    api<Overview>(`/finance/overview?${params}`, { token })
      .then(setOverview)
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));
  }, [token, period, dateFrom, dateTo]);

  if (!canAccess) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-4">{t('finance.title')}</h1>
        <p className="text-slate-600">{t('finance.onlyManagers')}</p>
      </div>
    );
  }

  const formatTzs = (n: number) =>
    new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n || 0);

  const vatEnabled = overview?.vat?.vat_enabled === true && (overview?.vat?.vat_rate ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t('finance.taxSummary')}</h1>
          <div className="text-sm text-slate-500 mt-1">
            {dateRange.from} — {dateRange.to}
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push('/dashboard/finance')}
          className="text-sm text-slate-600 hover:text-slate-800 hover:underline"
        >
          {t('common.back')}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="px-3 py-2 border rounded text-sm bg-white">
            <option value="today">{t('overview.today')}</option>
            <option value="week">{t('overview.thisWeek')}</option>
            <option value="month">{t('overview.thisMonth')}</option>
            <option value="bydate">{t('overview.byDate')}</option>
          </select>
          {period === 'bydate' && (
            <div className="flex items-center gap-2">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 border rounded text-sm bg-white" />
              <span className="text-slate-400 text-sm">{t('common.to')}</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 border rounded text-sm bg-white" />
            </div>
          )}
        </div>
      </div>

      {loading && !overview ? (
        <div className="text-slate-500">{t('common.loading')}</div>
      ) : !overview ? (
        <div className="text-slate-500">{t('common.noItems')}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => router.push('/dashboard/finance/tax/rooms')}
              className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
            >
              <div className="text-sm text-slate-500">{t('finance.roomsRevenue')}</div>
              <div className="text-xl font-semibold">{formatTzs(overview.bySector.rooms.vat)}</div>
              <div className="text-xs text-slate-500 mt-1">{vatEnabled ? `${Math.round((overview.vat.vat_rate || 0) * 100)}% • ${overview.vat.vat_type}` : t('finance.vatDisabled')}</div>
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/finance/tax/bar')}
              className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
            >
              <div className="text-sm text-slate-500">{t('bar.title')}</div>
              <div className="text-xl font-semibold">{formatTzs(overview.bySector.bar.vat)}</div>
              <div className="text-xs text-slate-500 mt-1">{vatEnabled ? `${Math.round((overview.vat.vat_rate || 0) * 100)}% • ${overview.vat.vat_type}` : t('finance.vatDisabled')}</div>
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/finance/tax/restaurant')}
              className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
            >
              <div className="text-sm text-slate-500">{t('restaurant.title')}</div>
              <div className="text-xl font-semibold">{formatTzs(overview.bySector.restaurant.vat)}</div>
              <div className="text-xs text-slate-500 mt-1">{vatEnabled ? `${Math.round((overview.vat.vat_rate || 0) * 100)}% • ${overview.vat.vat_type}` : t('finance.vatDisabled')}</div>
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/finance/tax/other')}
              className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
            >
              <div className="text-sm text-slate-500">{t('finance.otherRevenue')}</div>
              <div className="text-xl font-semibold">{formatTzs(overview.bySector.other.vat)}</div>
              <div className="text-xs text-slate-500 mt-1">{vatEnabled ? `${Math.round((overview.vat.vat_rate || 0) * 100)}% • ${overview.vat.vat_type}` : t('finance.vatDisabled')}</div>
            </button>
          </div>

          <div className="bg-white border rounded-lg p-4 text-left">
            <div className="text-sm text-slate-500">{t('finance.allSectors')}</div>
            <div className="text-xl font-semibold">{formatTzs(overview.totals.vatCollected)}</div>
          </div>
        </>
      )}
    </div>
  );
}

