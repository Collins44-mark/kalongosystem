'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { isManagerLevel } from '@/lib/roles';
import { useSearch } from '@/store/search';
import { notifyError, notifySuccess } from '@/store/notifications';

type Period = 'today' | 'week' | 'month' | 'bydate';
type Sector = 'all' | 'rooms' | 'bar' | 'restaurant';
type Metric = 'net' | 'gross' | 'vat';

type Overview = {
  period: { from: string; to: string };
  vat: { vat_enabled: boolean; vat_rate: number; vat_type: 'inclusive' | 'exclusive' };
  totals: { netRevenue: number; grossSales: number; vatCollected: number };
  bySector: {
    rooms: { net: number; vat: number; gross: number };
    bar: { net: number; vat: number; gross: number };
    restaurant: { net: number; vat: number; gross: number };
  };
};

type TxnRow = {
  date: string;
  referenceId: string;
  sector: 'rooms' | 'bar' | 'restaurant';
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  paymentMode: string;
};

export default function FinancePage() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const searchQuery = useSearch((s) => s.query);
  const [period, setPeriod] = useState<Period>('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [metric, setMetric] = useState<Metric>('net');
  const [sector, setSector] = useState<Sector>('all');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [txLoading, setTxLoading] = useState(false);
  const [tx, setTx] = useState<{ total: number; rows: TxnRow[] }>({ total: 0, rows: [] });

  const viewHistory = useRef<{ metric: Metric; sector: Sector; page: number }[]>([]);

  const isManager = isManagerLevel(user?.role);

  const q = (searchQuery || '').trim().toLowerCase();

  const isMainView = metric === 'net' && sector === 'all';

  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseNotes, setExpenseNotes] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);

  if (!isManager) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-4">{t('finance.title')}</h1>
        <p className="text-slate-600">{t('finance.onlyManagers')}</p>
        <p className="text-sm text-slate-500 mt-2">{t('finance.createExpensesRole')}</p>
      </div>
    );
  }

  function pushViewHistory(nextMetric: Metric, nextSector: Sector, nextPage: number) {
    viewHistory.current.push({ metric, sector, page });
    setMetric(nextMetric);
    setSector(nextSector);
    setPage(nextPage);
  }

  useEffect(() => {
    const onBack = (e: Event) => {
      const prev = viewHistory.current.pop();
      if (prev) {
        setMetric(prev.metric);
        setSector(prev.sector);
        setPage(prev.page);
        e.preventDefault();
        return;
      }
      if (sector !== 'all' || metric !== 'net') {
        setMetric('net');
        setSector('all');
        setPage(1);
        e.preventDefault();
      }
    };
    window.addEventListener('hms-back', onBack);
    return () => window.removeEventListener('hms-back', onBack);
  }, [metric, sector, page]);

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

  useEffect(() => {
    if (!token) return;
    setTxLoading(true);
    const params = new URLSearchParams();
    params.set('period', period);
    if (period === 'bydate' && dateFrom && dateTo) {
      params.set('from', dateFrom);
      params.set('to', dateTo);
    }
    params.set('sector', sector);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    api<{ total: number; rows: TxnRow[] }>(`/finance/transactions?${params}`, { token })
      .then((res: any) => setTx({ total: Number(res?.total || 0), rows: Array.isArray(res?.rows) ? res.rows : [] }))
      .catch(() => setTx({ total: 0, rows: [] }))
      .finally(() => setTxLoading(false));
  }, [token, period, dateFrom, dateTo, sector, page, pageSize]);

  const displayedRows = useMemo(() => {
    if (!q) return tx.rows;
    return tx.rows.filter((r) => {
      const txt = `${r.date} ${r.referenceId} ${r.sector} ${r.paymentMode} ${r.netAmount} ${r.vatAmount} ${r.grossAmount}`.toLowerCase();
      return txt.includes(q);
    });
  }, [q, tx.rows]);

  const totalPages = Math.max(1, Math.ceil((tx.total || 0) / pageSize));
  const vatEnabled = overview?.vat?.vat_enabled === true && (overview?.vat?.vat_rate ?? 0) > 0;

  function formatTzs(n: number) {
    return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n || 0);
  }

  function labelSector(s: Sector) {
    if (s === 'rooms') return t('finance.roomsRevenue');
    if (s === 'bar') return t('bar.title');
    if (s === 'restaurant') return t('restaurant.title');
    return t('finance.allSectors');
  }

  async function recordExpense() {
    if (!token) return;
    const amount = Number(expenseAmount);
    if (!expenseCategory.trim() || !Number.isFinite(amount) || amount <= 0 || !expenseDate) {
      notifyError(t('common.fillAllFields'));
      return;
    }
    setSavingExpense(true);
    try {
      await api(`/finance/expenses`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          category: expenseCategory.trim(),
          amount,
          description: expenseNotes.trim() || undefined,
          expenseDate,
        }),
      });
      notifySuccess(t('finance.expenseRecorded'));
      setExpenseCategory('');
      setExpenseAmount('');
      setExpenseNotes('');
      // Refresh overview + transactions (cashflow impact)
      setPage(1);
      const params = new URLSearchParams();
      params.set('period', period);
      if (period === 'bydate' && dateFrom && dateTo) {
        params.set('from', dateFrom);
        params.set('to', dateTo);
      }
      api<Overview>(`/finance/overview?${params}`, { token })
        .then(setOverview)
        .catch(() => {});
    } catch (e: any) {
      notifyError(e?.message || 'Request failed');
    } finally {
      setSavingExpense(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('finance.title')}</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={period} onChange={(e) => { setPeriod(e.target.value as Period); setPage(1); }} className="px-3 py-2 border rounded text-sm bg-white">
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

        <div className="flex items-center gap-2">
          <button type="button" className="px-3 py-2 border rounded text-sm bg-white hover:bg-slate-50" disabled>
            CSV
          </button>
          <button type="button" className="px-3 py-2 border rounded text-sm bg-white hover:bg-slate-50" disabled>
            Excel
          </button>
          <button type="button" className="px-3 py-2 border rounded text-sm bg-white hover:bg-slate-50" disabled>
            PDF
          </button>
        </div>
      </div>

      {loading && !overview ? (
        <div className="text-slate-500">{t('common.loading')}</div>
      ) : overview ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => pushViewHistory('net', 'all', 1)}
              className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
            >
              <div className="text-sm text-slate-500">{t('finance.netRevenue')}</div>
              <div className="text-xl font-semibold">{formatTzs(overview.totals.netRevenue)}</div>
              <div className="text-xs text-slate-500 mt-1">{vatEnabled ? t('finance.beforeVat') : t('finance.vatDisabled')}</div>
            </button>
            <button
              type="button"
              onClick={() => pushViewHistory('gross', 'all', 1)}
              className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
            >
              <div className="text-sm text-slate-500">{t('finance.grossSales')}</div>
              <div className="text-xl font-semibold">{formatTzs(overview.totals.grossSales)}</div>
              <div className="text-xs text-slate-500 mt-1">{t('finance.paymentsReceived')}</div>
            </button>
            <button
              type="button"
              onClick={() => pushViewHistory('vat', 'all', 1)}
              className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
            >
              <div className="text-sm text-slate-500">{t('finance.vatCollected')}</div>
              <div className="text-xl font-semibold">{formatTzs(overview.totals.vatCollected)}</div>
              <div className="text-xs text-slate-500 mt-1">
                {vatEnabled ? `${Math.round((overview.vat.vat_rate || 0) * 100)}% · ${overview.vat.vat_type}` : t('finance.vatDisabled')}
              </div>
            </button>
          </div>

          {sector === 'all' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(['rooms', 'bar', 'restaurant'] as const).map((s) => {
                const val = metric === 'net'
                  ? overview.bySector[s].net
                  : metric === 'vat'
                    ? overview.bySector[s].vat
                    : overview.bySector[s].gross;
                const title = metric === 'net' ? t('finance.netRevenue') : metric === 'vat' ? t('finance.vatCollected') : t('finance.grossSales');
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => pushViewHistory(metric, s, 1)}
                    className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
                  >
                    <div className="text-sm text-slate-500">{labelSector(s)}</div>
                    <div className="text-lg font-semibold">{formatTzs(val)}</div>
                    <div className="text-xs text-slate-500 mt-1">{title}</div>
                  </button>
                );
              })}
            </div>
          )}

          {isMainView && (
            <div className="bg-white border rounded-lg p-4 max-w-2xl">
              <h2 className="font-medium mb-3">{t('finance.recordExpense')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">{t('finance.category')}</label>
                  <input
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm"
                    placeholder={t('finance.category')}
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">{t('finance.amount')}</label>
                  <input
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm"
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">{t('finance.date')}</label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm bg-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-slate-600 mb-1">{t('finance.notesOptional')}</label>
                  <input
                    value={expenseNotes}
                    onChange={(e) => setExpenseNotes(e.target.value)}
                    className="w-full px-3 py-2 border rounded text-sm"
                    placeholder={t('finance.notesOptional')}
                  />
                </div>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={recordExpense}
                  disabled={savingExpense}
                  className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 text-sm"
                >
                  {savingExpense ? t('common.loading') : t('finance.record')}
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">{t('finance.transactions')}</div>
                <div className="text-xs text-slate-500">
                  {t('finance.showingFor')}: {labelSector(sector)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select value={sector} onChange={(e) => { setSector(e.target.value as Sector); setPage(1); }} className="px-3 py-2 border rounded text-sm bg-white">
                  <option value="all">{t('finance.allSectors')}</option>
                  <option value="rooms">{t('finance.roomsRevenue')}</option>
                  <option value="bar">{t('bar.title')}</option>
                  <option value="restaurant">{t('restaurant.title')}</option>
                </select>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="px-3 py-2 border rounded text-sm bg-white">
                  {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}/page</option>)}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-left text-slate-600">
                    <th className="p-3 font-medium">{t('common.date')}</th>
                    <th className="p-3 font-medium">{t('finance.referenceId')}</th>
                    <th className="p-3 font-medium">{t('finance.sector')}</th>
                    <th className="p-3 font-medium text-right">{t('finance.netAmount')}</th>
                    <th className="p-3 font-medium text-right">{t('finance.vatAmount')}</th>
                    <th className="p-3 font-medium text-right">{t('finance.grossAmount')}</th>
                    <th className="p-3 font-medium">{t('finance.paymentMode')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {txLoading ? (
                    <tr><td className="p-3 text-slate-500" colSpan={7}>{t('common.loading')}</td></tr>
                  ) : displayedRows.length === 0 ? (
                    <tr><td className="p-3 text-slate-500" colSpan={7}>{t('common.noItems')}</td></tr>
                  ) : (
                    displayedRows.map((r, idx) => (
                      <tr key={`${r.referenceId}-${idx}`} className="hover:bg-slate-50">
                        <td className="p-3 whitespace-nowrap">{new Date(r.date).toLocaleString()}</td>
                        <td className="p-3 font-mono text-xs">{r.referenceId}</td>
                        <td className="p-3">{r.sector}</td>
                        <td className="p-3 text-right whitespace-nowrap">{formatTzs(r.netAmount)}</td>
                        <td className="p-3 text-right whitespace-nowrap">{formatTzs(r.vatAmount)}</td>
                        <td className="p-3 text-right whitespace-nowrap">{formatTzs(r.grossAmount)}</td>
                        <td className="p-3 whitespace-nowrap">{r.paymentMode}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t flex items-center justify-between">
              <div className="text-xs text-slate-500">
                {t('finance.page')} {page} / {totalPages} · {t('finance.totalRows')}: {tx.total}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-2 border rounded text-sm bg-white disabled:opacity-50">
                  {t('common.back')}
                </button>
                <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-2 border rounded text-sm bg-white disabled:opacity-50">
                  {t('common.next')}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-slate-500">{t('common.noItems')}</div>
      )}

    </div>
  );
}
