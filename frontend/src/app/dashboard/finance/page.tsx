'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { isManagerLevel } from '@/lib/roles';
import { useSearch } from '@/store/search';
import { notifyError, notifySuccess } from '@/store/notifications';

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type Period = 'today' | 'week' | 'month' | 'bydate';
type Sector = 'all' | 'rooms' | 'bar' | 'restaurant' | 'other';
type Metric = 'net' | 'gross' | 'vat' | 'expenses';
type ViewLevel = 'overview' | 'metric' | 'transactions' | 'expenses';

type Overview = {
  period: { from: string; to: string };
  vat: { vat_enabled: boolean; vat_rate: number; vat_type: 'inclusive' | 'exclusive' };
  totals: { netRevenue: number; grossSales: number; vatCollected: number };
  bySector: {
    rooms: { net: number; vat: number; gross: number };
    bar: { net: number; vat: number; gross: number };
    restaurant: { net: number; vat: number; gross: number };
    other: { net: number; vat: number; gross: number };
  };
};

type TxnRow = {
  date: string;
  referenceId: string;
  sector: 'rooms' | 'bar' | 'restaurant' | 'other';
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
  const [level, setLevel] = useState<ViewLevel>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [expensesData, setExpensesData] = useState<{ byCategory: Record<string, number>; expenses: { id: string; category: string; amount: number; date: string; notes: string | null }[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [txLoading, setTxLoading] = useState(false);
  const [tx, setTx] = useState<{ total: number; rows: TxnRow[] }>({ total: 0, rows: [] });

  const viewHistory = useRef<{ level: ViewLevel; metric: Metric; sector: Sector; page: number }[]>([]);

  const isManager = isManagerLevel(user?.role);
  const isFinance = user?.role === 'FINANCE';
  const canAccess = isManager || isFinance;

  const q = (searchQuery || '').trim().toLowerCase();

  const canRecordExpense = isManager || isFinance;
  const [expenseCategory, setExpenseCategory] = useState<'HOUSEKEEPING' | 'MAINTENANCE' | 'UTILITIES' | 'OTHERS'>('HOUSEKEEPING');
  const [expenseOtherCategory, setExpenseOtherCategory] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseNotes, setExpenseNotes] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);
  const [selectedExpenseCategory, setSelectedExpenseCategory] = useState<string | null>(null);

  const [revenueCategories, setRevenueCategories] = useState<{ id: string; name: string }[]>([]);
  const [revCategoryId, setRevCategoryId] = useState('');
  const [revNewCategoryMode, setRevNewCategoryMode] = useState(false);
  const [revNewCategoryName, setRevNewCategoryName] = useState('');
  const [savingNewCategory, setSavingNewCategory] = useState(false);
  const [revBookingId, setRevBookingId] = useState<string>('');
  const [revBookingQuery, setRevBookingQuery] = useState('');
  const [revBookingOptions, setRevBookingOptions] = useState<{ id: string; label: string }[]>([]);
  const [revDescription, setRevDescription] = useState('');
  const [revAmount, setRevAmount] = useState('');
  const [revPaymentMethod, setRevPaymentMethod] = useState<'CASH' | 'BANK' | 'CARD'>('CASH');
  const [revDate, setRevDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [savingRevenue, setSavingRevenue] = useState(false);

  // Business expectation: "Net profit" = revenue after expenses.
  const netProfit = useMemo(() => {
    const gross = overview?.totals?.grossSales ?? 0;
    const exp = totalExpenses ?? 0;
    return gross - exp;
  }, [overview?.totals?.grossSales, totalExpenses]);

  if (!canAccess) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-4">{t('finance.title')}</h1>
        <p className="text-slate-600">{t('finance.onlyManagers')}</p>
      </div>
    );
  }

  function pushViewHistory(nextLevel: ViewLevel, nextMetric: Metric, nextSector: Sector, nextPage: number) {
    viewHistory.current.push({ level, metric, sector, page });
    setLevel(nextLevel);
    setMetric(nextMetric);
    setSector(nextSector);
    setPage(nextPage);
  }

  useEffect(() => {
    const onBack = (e: Event) => {
      if (level === 'expenses' && selectedExpenseCategory) {
        setSelectedExpenseCategory(null);
        e.preventDefault();
        return;
      }
      const prev = viewHistory.current.pop();
      if (prev) {
        setLevel(prev.level);
        setMetric(prev.metric);
        setSector(prev.sector);
        setPage(prev.page);
        if (prev.level === 'expenses') setSelectedExpenseCategory(null);
        e.preventDefault();
        return;
      }
      if (level !== 'overview') {
        setLevel('overview');
        setMetric('net');
        setSector('all');
        setPage(1);
        setSelectedExpenseCategory(null);
        e.preventDefault();
      }
    };
    window.addEventListener('hms-back', onBack);
    return () => window.removeEventListener('hms-back', onBack);
  }, [level, metric, sector, page, selectedExpenseCategory]);

  const dateRange = (() => {
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
  })();

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('period', period);
    if (period === 'bydate' && dateFrom && dateTo) {
      params.set('from', dateFrom);
      params.set('to', dateTo);
    }
    const expParams = new URLSearchParams();
    if (dateRange.from) expParams.set('from', dateRange.from);
    if (dateRange.to) expParams.set('to', dateRange.to);
    Promise.all([
      api<Overview>(`/finance/overview?${params}`, { token }),
      api<{ expenses: unknown[]; total: number }>(`/finance/expenses?${expParams}`, { token }).then((r) => r?.total ?? 0),
      api<{ byCategory: Record<string, number>; expenses: { id: string; category: string; amount: number; date: string; notes: string | null }[] }>(`/finance/expenses/by-category?${expParams}`, { token }),
    ])
      .then(([ov, tot, exp]) => {
        setOverview(ov);
        setTotalExpenses(typeof tot === 'number' ? tot : 0);
        setExpensesData(exp || null);
      })
      .catch(() => {
        setOverview(null);
        setTotalExpenses(0);
        setExpensesData(null);
      })
      .finally(() => setLoading(false));
  }, [token, period, dateFrom, dateTo]);

  useEffect(() => {
    if (!token) return;
    api<{ id: string; name: string }[]>(`/finance/revenue-categories`, { token })
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setRevenueCategories(list);
        if (!revCategoryId && list.length) setRevCategoryId(list[0].id);
      })
      .catch(() => setRevenueCategories([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function createRevenueCategoryInline() {
    if (!token) return;
    const name = revNewCategoryName.trim();
    if (!name) {
      notifyError(t('common.fillAllFields'));
      return;
    }
    setSavingNewCategory(true);
    try {
      const created = await api<{ id: string; name: string }>(`/finance/revenue-categories`, {
        token,
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      if (created?.id) {
        const next = [...revenueCategories, { id: created.id, name: created.name }].sort((a, b) => a.name.localeCompare(b.name));
        setRevenueCategories(next);
        setRevCategoryId(created.id);
        setRevNewCategoryName('');
        setRevNewCategoryMode(false);
        notifySuccess(t('settings.categoryAdded'));
      }
    } catch (e: any) {
      notifyError(e?.message || 'Request failed');
    } finally {
      setSavingNewCategory(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    const q = revBookingQuery.trim();
    if (!q) {
      setRevBookingOptions([]);
      return;
    }
    const handle = window.setTimeout(() => {
      api<{ id: string; label: string }[]>(`/finance/bookings/lookup?q=${encodeURIComponent(q)}`, { token })
        .then((rows) => setRevBookingOptions(Array.isArray(rows) ? rows : []))
        .catch(() => setRevBookingOptions([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [token, revBookingQuery]);

  useEffect(() => {
    if (!token) return;
    if (level !== 'transactions') return;
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
  }, [token, period, dateFrom, dateTo, sector, page, pageSize, level]);

  const displayedRows = useMemo(() => {
    if (level !== 'transactions') return [];
    if (!q) return tx.rows;
    return tx.rows.filter((r) => {
      const txt = `${r.date} ${r.referenceId} ${r.sector} ${r.paymentMode} ${r.netAmount} ${r.vatAmount} ${r.grossAmount}`.toLowerCase();
      return txt.includes(q);
    });
  }, [q, tx.rows, level]);

  const totalPages = Math.max(1, Math.ceil((tx.total || 0) / pageSize));
  const vatEnabled = overview?.vat?.vat_enabled === true && (overview?.vat?.vat_rate ?? 0) > 0;

  function formatTzs(n: number) {
    return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n || 0);
  }

  function labelSector(s: Sector) {
    if (s === 'rooms') return t('finance.roomsRevenue');
    if (s === 'bar') return t('bar.title');
    if (s === 'restaurant') return t('restaurant.title');
    if (s === 'other') return t('finance.otherRevenue');
    return t('finance.allSectors');
  }

  function parseTzsInput(raw: string): number {
    // Accept common user-entered formats like "1000", "1,000", "1 000", "TSh 1,000", "1.000,50"
    let s = String(raw || '').trim();
    if (!s) return NaN;
    s = s.replace(/tsh|tzs/gi, '').trim();
    s = s.replace(/\s+/g, '');

    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    if (hasComma && hasDot) {
      // Decide decimal separator by the last occurring symbol
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        // "1.000,50" -> "1000.50"
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        // "1,000.50" -> "1000.50"
        s = s.replace(/,/g, '');
      }
    } else if (hasComma && !hasDot) {
      // If single comma looks like decimal, treat it as decimal separator; otherwise thousands separator
      const parts = s.split(',');
      if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
        s = `${parts[0]}.${parts[1]}`;
      } else {
        s = s.replace(/,/g, '');
      }
    }

    s = s.replace(/[^0-9.-]/g, '');
    const n = Number(s);
    return n;
  }

  async function recordExpense() {
    if (!token) return;
    if (!canRecordExpense) return;
    const amount = parseTzsInput(expenseAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !expenseDate) {
      notifyError(t('common.fillAllFields'));
      return;
    }
    if (expenseCategory === 'OTHERS' && !expenseOtherCategory.trim()) {
      notifyError(t('common.fillAllFields'));
      return;
    }
    setSavingExpense(true);
    try {
      const descParts: string[] = [];
      if (expenseCategory === 'OTHERS') descParts.push(`Other: ${expenseOtherCategory.trim()}`);
      if (expenseNotes.trim()) descParts.push(expenseNotes.trim());
      const description = descParts.length ? descParts.join(' — ') : undefined;

      await api(`/finance/expenses`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          category: expenseCategory,
          amount,
          description,
          expenseDate,
        }),
      });
      notifySuccess(t('finance.expenseRecorded'));
      setExpenseCategory('HOUSEKEEPING');
      setExpenseOtherCategory('');
      setExpenseAmount('');
      setExpenseNotes('');

      // Refresh overview + expenses aggregation
      const params = new URLSearchParams();
      params.set('period', period);
      if (period === 'bydate' && dateFrom && dateTo) {
        params.set('from', dateFrom);
        params.set('to', dateTo);
      }
      const expParams = new URLSearchParams();
      if (dateRange.from) expParams.set('from', dateRange.from);
      if (dateRange.to) expParams.set('to', dateRange.to);
      const [ov, tot, exp] = await Promise.all([
        api<Overview>(`/finance/overview?${params}`, { token }),
        api<{ expenses: unknown[]; total: number }>(`/finance/expenses?${expParams}`, { token }).then((r) => r?.total ?? 0),
        api<{ byCategory: Record<string, number>; expenses: { id: string; category: string; amount: number; date: string; notes: string | null }[] }>(`/finance/expenses/by-category?${expParams}`, { token }),
      ]);
      setOverview(ov);
      setTotalExpenses(typeof tot === 'number' ? tot : 0);
      setExpensesData(exp || null);
    } catch (e: any) {
      notifyError(e?.message || 'Request failed');
    } finally {
      setSavingExpense(false);
    }
  }

  async function recordOtherRevenue() {
    if (!token) return;
    const amount = parseTzsInput(revAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !revDate || !revCategoryId) {
      notifyError(t('common.fillAllFields'));
      return;
    }
    setSavingRevenue(true);
    try {
      await api(`/finance/other-revenues`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          bookingId: revBookingId || undefined,
          categoryId: revCategoryId,
          description: revDescription.trim() || undefined,
          amount,
          paymentMethod: revPaymentMethod,
          date: revDate,
        }),
      });
      notifySuccess(t('finance.otherRevenueRecorded'));
      setRevBookingId('');
      setRevBookingQuery('');
      setRevBookingOptions([]);
      setRevDescription('');
      setRevAmount('');
      setRevPaymentMethod('CASH');
      setRevDate(new Date().toISOString().slice(0, 10));

      const params = new URLSearchParams();
      params.set('period', period);
      if (period === 'bydate' && dateFrom && dateTo) {
        params.set('from', dateFrom);
        params.set('to', dateTo);
      }
      const expParams = new URLSearchParams();
      if (dateRange.from) expParams.set('from', dateRange.from);
      if (dateRange.to) expParams.set('to', dateRange.to);
      const [ov, tot, exp] = await Promise.all([
        api<Overview>(`/finance/overview?${params}`, { token }),
        api<{ expenses: unknown[]; total: number }>(`/finance/expenses?${expParams}`, { token }).then((r) => r?.total ?? 0),
        api<{ byCategory: Record<string, number>; expenses: { id: string; category: string; amount: number; date: string; notes: string | null }[] }>(`/finance/expenses/by-category?${expParams}`, { token }),
      ]);
      setOverview(ov);
      setTotalExpenses(typeof tot === 'number' ? tot : 0);
      setExpensesData(exp || null);
    } catch (e: any) {
      notifyError(e?.message || 'Request failed');
    } finally {
      setSavingRevenue(false);
    }
  }

  const breadcrumb = (() => {
    const m = metric === 'net' ? t('finance.netRevenue') : metric === 'gross' ? t('finance.grossSales') : metric === 'vat' ? t('finance.vatCollected') : t('finance.expenses');
    if (level === 'overview') return t('finance.title');
    if (level === 'expenses') {
      const catLabel = selectedExpenseCategory === 'HOUSEKEEPING' ? t('finance.housekeeping') : selectedExpenseCategory === 'MAINTENANCE' ? t('finance.maintenance') : selectedExpenseCategory === 'UTILITIES' ? t('finance.utilities') : selectedExpenseCategory === 'OTHERS' ? t('finance.others') : '';
      return selectedExpenseCategory ? `${t('finance.title')} · ${t('finance.expenses')} · ${catLabel}` : `${t('finance.title')} · ${t('finance.expenses')}`;
    }
    if (level === 'metric') return `${t('finance.title')} · ${m}`;
    return `${t('finance.title')} · ${m} · ${labelSector(sector)}`;
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('finance.title')}</h1>
        {level !== 'overview' && (
          <div className="mt-1 flex items-center justify-between">
            <div className="text-sm text-slate-500">{breadcrumb}</div>
            <button
              type="button"
              onClick={() => {
                if (level === 'expenses' && selectedExpenseCategory) {
                  setSelectedExpenseCategory(null);
                  return;
                }
                const prev = viewHistory.current.pop();
                if (prev) {
                  setLevel(prev.level);
                  setMetric(prev.metric);
                  setSector(prev.sector);
                  setPage(prev.page);
                  if (prev.level === 'expenses') setSelectedExpenseCategory(null);
                } else {
                  setLevel('overview');
                  setMetric('net');
                  setSector('all');
                  setPage(1);
                  setSelectedExpenseCategory(null);
                }
              }}
              className="text-sm text-slate-600 hover:text-slate-800 hover:underline"
            >
              {t('common.back')}
            </button>
          </div>
        )}
      </div>

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
      </div>

      {loading && !overview ? (
        <div className="text-slate-500">{t('common.loading')}</div>
      ) : overview ? (
        <>
          {level === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  type="button"
                  onClick={() => pushViewHistory('transactions', 'gross', 'rooms', 1)}
                  className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
                >
                  <div className="text-sm text-slate-500">{t('finance.roomsRevenue')}</div>
                  <div className="text-xl font-semibold">{formatTzs(overview.bySector.rooms.gross)}</div>
                  <div className="text-xs text-slate-500 mt-1">{t('finance.paymentsReceived')}</div>
                </button>
                <button
                  type="button"
                  onClick={() => pushViewHistory('transactions', 'gross', 'bar', 1)}
                  className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
                >
                  <div className="text-sm text-slate-500">{t('bar.title')}</div>
                  <div className="text-xl font-semibold">{formatTzs(overview.bySector.bar.gross)}</div>
                  <div className="text-xs text-slate-500 mt-1">{t('finance.paymentsReceived')}</div>
                </button>
                <button
                  type="button"
                  onClick={() => pushViewHistory('transactions', 'gross', 'restaurant', 1)}
                  className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
                >
                  <div className="text-sm text-slate-500">{t('restaurant.title')}</div>
                  <div className="text-xl font-semibold">{formatTzs(overview.bySector.restaurant.gross)}</div>
                  <div className="text-xs text-slate-500 mt-1">{t('finance.paymentsReceived')}</div>
                </button>
                <button
                  type="button"
                  onClick={() => pushViewHistory('transactions', 'gross', 'other', 1)}
                  className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
                >
                  <div className="text-sm text-slate-500">{t('finance.otherRevenue')}</div>
                  <div className="text-xl font-semibold">{formatTzs(overview.bySector.other.gross)}</div>
                  <div className="text-xs text-slate-500 mt-1">{t('finance.paymentsReceived')}</div>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  type="button"
                  onClick={() => pushViewHistory('transactions', 'gross', 'all', 1)}
                  className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
                >
                  <div className="text-sm text-slate-500">{t('finance.totalRevenue')}</div>
                  <div className="text-xl font-semibold">{formatTzs(overview.totals.grossSales)}</div>
                  <div className="text-xs text-slate-500 mt-1">{t('finance.paymentsReceived')}</div>
                </button>
                <button
                  type="button"
                  onClick={() => pushViewHistory('expenses', 'expenses', 'all', 1)}
                  className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
                >
                  <div className="text-sm text-slate-500">{t('finance.totalExpenses')}</div>
                  <div className="text-xl font-semibold">{formatTzs(totalExpenses)}</div>
                  <div className="text-xs text-slate-500 mt-1">{t('finance.expensesInPeriod')}</div>
                </button>
                <div className="bg-white border rounded-lg p-4 text-left">
                  <div className="text-sm text-slate-500">{t('finance.netProfit')}</div>
                  <div className="text-xl font-semibold">{formatTzs(netProfit)}</div>
                  <div className="text-xs text-slate-500 mt-1">Revenue − Expenses</div>
                </div>
                <div className="bg-white border rounded-lg p-4 text-left">
                  <div className="text-sm text-slate-500">{t('finance.taxSummary')}</div>
                  <div className="text-xl font-semibold">{formatTzs(overview.totals.vatCollected)}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {vatEnabled ? `${Math.round((overview.vat.vat_rate || 0) * 100)}% • ${overview.vat.vat_type}` : t('finance.vatDisabled')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {level === 'expenses' && (
            <div className="space-y-4">
              {selectedExpenseCategory === null ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(['HOUSEKEEPING', 'MAINTENANCE', 'UTILITIES', 'OTHERS'] as const).map((cat) => {
                    const amount = expensesData?.byCategory?.[cat] ?? 0;
                    const label = cat === 'HOUSEKEEPING' ? t('finance.housekeeping') : cat === 'MAINTENANCE' ? t('finance.maintenance') : cat === 'UTILITIES' ? t('finance.utilities') : t('finance.others');
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedExpenseCategory(cat)}
                        className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
                      >
                        <div className="text-sm text-slate-500">{label}</div>
                        <div className="text-xl font-semibold text-slate-800 mt-1">{formatTzs(amount)}</div>
                        <div className="text-xs text-slate-500 mt-1">{t('finance.viewDetails')}</div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white border rounded-lg overflow-hidden">
                  <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{t('finance.expensesByCategory')}</div>
                      <div className="text-xs text-slate-500">
                        {selectedExpenseCategory === 'HOUSEKEEPING' ? t('finance.housekeeping') : selectedExpenseCategory === 'MAINTENANCE' ? t('finance.maintenance') : selectedExpenseCategory === 'UTILITIES' ? t('finance.utilities') : t('finance.others')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedExpenseCategory(null)}
                      className="text-sm text-slate-600 hover:text-slate-800 hover:underline"
                    >
                      {t('common.back')}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[520px]">
                      <thead className="bg-slate-50 border-b">
                        <tr className="text-left text-slate-600">
                          <th className="p-3 font-medium">{t('common.date')}</th>
                          <th className="p-3 font-medium">{t('finance.category')}</th>
                          <th className="p-3 font-medium text-right">{t('finance.amount')}</th>
                          <th className="p-3 font-medium">{t('finance.notes')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {!expensesData ? (
                          <tr><td className="p-3 text-slate-500" colSpan={4}>{t('common.loading')}</td></tr>
                        ) : (() => {
                          const filtered = expensesData.expenses.filter((e) => e.category === selectedExpenseCategory);
                          return filtered.length === 0 ? (
                            <tr><td className="p-3 text-slate-500" colSpan={4}>{t('finance.noExpenses')}</td></tr>
                          ) : (
                            filtered.map((e) => (
                              <tr key={e.id} className="hover:bg-slate-50">
                                <td className="p-3 whitespace-nowrap">{new Date(e.date).toLocaleDateString()}</td>
                                <td className="p-3">{e.category}</td>
                                <td className="p-3 text-right whitespace-nowrap">{formatTzs(e.amount)}</td>
                                <td className="p-3 text-slate-600">{e.notes || '-'}</td>
                              </tr>
                            ))
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {level === 'metric' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(['rooms', 'bar', 'restaurant', 'other'] as const).map((s) => {
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
                    onClick={() => pushViewHistory('transactions', metric, s, 1)}
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

          {canRecordExpense && level === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">
              <div className="bg-white border rounded-lg p-4">
                <h2 className="font-medium mb-3">{t('finance.recordExpense')}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">{t('finance.category')}</label>
                    <select
                      value={expenseCategory}
                      onChange={(e) => setExpenseCategory(e.target.value as any)}
                      className="w-full px-3 py-2 border rounded text-sm bg-white"
                    >
                      <option value="HOUSEKEEPING">{t('finance.housekeeping')}</option>
                      <option value="MAINTENANCE">{t('finance.maintenance')}</option>
                      <option value="UTILITIES">{t('finance.utilities')}</option>
                      <option value="OTHERS">{t('finance.others')}</option>
                    </select>
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
                  {expenseCategory === 'OTHERS' && (
                    <div className="sm:col-span-2">
                      <label className="block text-sm text-slate-600 mb-1">{t('finance.category')} ({t('finance.others')})</label>
                      <input
                        value={expenseOtherCategory}
                        onChange={(e) => setExpenseOtherCategory(e.target.value)}
                        className="w-full px-3 py-2 border rounded text-sm"
                        placeholder="e.g. Marketing"
                      />
                    </div>
                  )}
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

              <div className="bg-white border rounded-lg p-4">
                <h2 className="font-medium mb-3">{t('finance.recordOtherRevenue')}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">{t('finance.category')}</label>
                    {!revNewCategoryMode ? (
                      <>
                        <select
                          value={revCategoryId}
                          onChange={(e) => setRevCategoryId(e.target.value)}
                          className="w-full px-3 py-2 border rounded text-sm bg-white"
                        >
                          {revenueCategories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setRevNewCategoryMode(true)}
                          className="mt-2 text-xs text-teal-700 hover:underline"
                        >
                          + {t('settings.revenueCategories')}
                        </button>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <input
                          value={revNewCategoryName}
                          onChange={(e) => setRevNewCategoryName(e.target.value)}
                          className="w-full px-3 py-2 border rounded text-sm"
                          placeholder={t('settings.addCategoryPlaceholder')}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={createRevenueCategoryInline}
                            disabled={savingNewCategory}
                            className="px-3 py-2 rounded bg-teal-600 text-white text-sm hover:bg-teal-700 disabled:opacity-60"
                          >
                            {savingNewCategory ? t('common.loading') : t('common.add')}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setRevNewCategoryMode(false); setRevNewCategoryName(''); }}
                            disabled={savingNewCategory}
                            className="px-3 py-2 rounded bg-slate-200 text-sm hover:bg-slate-300 disabled:opacity-60"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">{t('finance.amount')}</label>
                    <input
                      value={revAmount}
                      onChange={(e) => setRevAmount(e.target.value)}
                      className="w-full px-3 py-2 border rounded text-sm"
                      inputMode="decimal"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">{t('finance.paymentMethod')}</label>
                    <select
                      value={revPaymentMethod}
                      onChange={(e) => setRevPaymentMethod(e.target.value as any)}
                      className="w-full px-3 py-2 border rounded text-sm bg-white"
                    >
                      <option value="CASH">{t('finance.cash')}</option>
                      <option value="BANK">{t('finance.bank')}</option>
                      <option value="CARD">{t('finance.card')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">{t('finance.date')}</label>
                    <input
                      type="date"
                      value={revDate}
                      onChange={(e) => setRevDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded text-sm bg-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm text-slate-600 mb-1">{t('finance.attachToBookingOptional')}</label>
                    <input
                      value={revBookingQuery}
                      onChange={(e) => setRevBookingQuery(e.target.value)}
                      className="w-full px-3 py-2 border rounded text-sm"
                      placeholder={t('finance.searchBookingPlaceholder')}
                    />
                    <select
                      value={revBookingId}
                      onChange={(e) => setRevBookingId(e.target.value)}
                      className="mt-2 w-full px-3 py-2 border rounded text-sm bg-white"
                    >
                      <option value="">{t('finance.standaloneRevenue')}</option>
                      {revBookingOptions.map((b) => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm text-slate-600 mb-1">{t('finance.descriptionOptional')}</label>
                    <input
                      value={revDescription}
                      onChange={(e) => setRevDescription(e.target.value)}
                      className="w-full px-3 py-2 border rounded text-sm"
                      placeholder={t('finance.descriptionOptional')}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={recordOtherRevenue}
                    disabled={savingRevenue}
                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 text-sm"
                  >
                    {savingRevenue ? t('common.loading') : t('finance.record')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {level === 'transactions' && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{t('finance.transactions')}</div>
                  <div className="text-xs text-slate-500">
                    {t('finance.showingFor')}: {labelSector(sector)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
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
          )}
        </>
      ) : (
        <div className="text-slate-500">{t('common.noItems')}</div>
      )}

    </div>
  );
}
