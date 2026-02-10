'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { isManagerLevel } from '@/lib/roles';
import { useSearch } from '@/store/search';

type Dashboard = {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  bySector: { bar: number; restaurant: number; hotel: number };
  expenses: { id: string; category: string; amount: string; expenseDate: string; description?: string }[];
};

type SalesRow = { id: string; date: string; orderId: string; amount: number; paymentMode: string; staff: string };
type ExpenseRow = { id: string; category: string; amount: number; date: string; notes: string | null };

type View = 'cards' | 'revenue' | 'revenue-sector' | 'expenses';

export default function FinancePage() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const searchQuery = useSearch((s) => s.query);
  const [data, setData] = useState<Dashboard | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('cards');
  const viewHistory = useRef<View[]>([]);
  const [selectedSector, setSelectedSector] = useState<'bar' | 'restaurant' | 'hotel'>('bar');
  const [salesHistory, setSalesHistory] = useState<SalesRow[]>([]);
  const [expenseDetail, setExpenseDetail] = useState<{ byCategory: Record<string, number>; expenses: ExpenseRow[] } | null>(null);

  const isManager = isManagerLevel(user?.role);

  const empty: Dashboard = {
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    bySector: { bar: 0, restaurant: 0, hotel: 0 },
    expenses: [],
  };

  useEffect(() => {
    if (!token || !isManager) return;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    api<Dashboard>(`/finance/dashboard?${params}`, { token })
      .then(setData)
      .catch(() => setData(empty))
      .finally(() => setLoading(false));
  }, [token, isManager, from, to]);

  function goView(next: View) {
    setView((current) => {
      if (current && current !== next) viewHistory.current.push(current);
      return next;
    });
  }

  // Support "back" within this page (internal views) from the global header back button.
  useEffect(() => {
    const onBack = (e: Event) => {
      const prev = viewHistory.current.pop();
      if (prev) {
        setView(prev);
        e.preventDefault();
        return;
      }
      if (view !== 'cards') {
        setView('cards');
        e.preventDefault();
      }
    };
    window.addEventListener('hms-back', onBack);
    return () => window.removeEventListener('hms-back', onBack);
  }, [view]);

  async function loadRevenueSector(sector: 'bar' | 'restaurant' | 'hotel') {
    if (!token) return;
    setSelectedSector(sector);
    goView('revenue-sector');
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const rows = await api<SalesRow[]>(`/finance/revenue/sector/${sector}?${params}`, { token }).catch(() => []);
    setSalesHistory(Array.isArray(rows) ? rows : []);
  }

  async function loadExpenseDetail() {
    if (!token) return;
    goView('expenses');
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await api<{ byCategory: Record<string, number>; expenses: ExpenseRow[] }>(`/finance/expenses/by-category?${params}`, { token }).catch(() => ({ byCategory: {}, expenses: [] }));
    setExpenseDetail(res);
  }

  if (!isManager) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-4">{t('finance.title')}</h1>
        <p className="text-slate-600">{t('finance.onlyManagers')}</p>
        <p className="text-sm text-slate-500 mt-2">{t('finance.createExpensesRole')}</p>
      </div>
    );
  }

  if (loading && !data) return <div className="text-slate-500">{t('common.loading')}</div>;
  const d = data ?? empty;
  const q = (searchQuery || '').trim().toLowerCase();

  const displayedSales =
    !q
      ? salesHistory
      : salesHistory.filter((r) => {
          const txt = `${r.orderId} ${r.paymentMode} ${r.staff} ${r.amount} ${r.date}`.toLowerCase();
          return txt.includes(q);
        });

  const displayedExpenses =
    !q || !expenseDetail
      ? expenseDetail?.expenses ?? []
      : expenseDetail.expenses.filter((e) => {
          const txt = `${e.category} ${e.amount} ${e.date} ${e.notes ?? ''}`.toLowerCase();
          return txt.includes(q);
        });

  const displayedByCategory =
    !expenseDetail
      ? {}
      : !q
        ? expenseDetail.byCategory
        : displayedExpenses.reduce<Record<string, number>>((acc, e) => {
            acc[e.category] = (acc[e.category] || 0) + (e.amount || 0);
            return acc;
          }, {});

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('finance.title')}</h1>

      <div className="flex flex-wrap gap-4 items-center">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border rounded text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border rounded text-sm" />
        {(view !== 'cards') && (
          <button onClick={() => goView('cards')} className="px-3 py-1 text-sm text-teal-600 hover:underline">
            ← {t('common.back')}
          </button>
        )}
      </div>

      {view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => { goView('revenue'); }}
            className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
          >
            <div className="text-sm text-slate-500">{t('overview.totalRevenue')}</div>
            <div className="text-xl font-semibold">{formatTzs(d.totalRevenue)}</div>
          </button>
          <button
            onClick={() => { goView('expenses'); void loadExpenseDetail(); }}
            className="bg-white border rounded-lg p-4 text-left hover:border-teal-500 hover:shadow-sm transition"
          >
            <div className="text-sm text-slate-500">{t('overview.totalExpenses')}</div>
            <div className="text-xl font-semibold">{formatTzs(d.totalExpenses)}</div>
          </button>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-slate-500">{t('overview.netProfit')}</div>
            <div className={`text-xl font-semibold ${d.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatTzs(d.netProfit)}
            </div>
          </div>
        </div>
      )}

      {view === 'revenue' && (
        <div className="space-y-4">
          <h2 className="font-medium">{t('finance.revenueBySector')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => loadRevenueSector('bar')}
              className="bg-white border rounded-lg p-4 text-left hover:border-teal-500"
            >
              <div className="text-sm text-slate-500">{t('bar.title')}</div>
              <div className="text-lg font-semibold">{formatTzs(d.bySector.bar)}</div>
            </button>
            <button
              onClick={() => loadRevenueSector('restaurant')}
              className="bg-white border rounded-lg p-4 text-left hover:border-teal-500"
            >
              <div className="text-sm text-slate-500">{t('restaurant.title')}</div>
              <div className="text-lg font-semibold">{formatTzs(d.bySector.restaurant)}</div>
            </button>
            <button
              onClick={() => loadRevenueSector('hotel')}
              className="bg-white border rounded-lg p-4 text-left hover:border-teal-500"
            >
              <div className="text-sm text-slate-500">{t('overview.hotelRooms')}</div>
              <div className="text-lg font-semibold">{formatTzs(d.bySector.hotel)}</div>
            </button>
          </div>
        </div>
      )}

      {view === 'revenue-sector' && (
        <div className="space-y-4">
          <h2 className="font-medium capitalize">{selectedSector} – {t('finance.revenueSummary')}</h2>
          <p className="text-sm text-slate-600">
            Total: {formatTzs(displayedSales.reduce((s, r) => s + r.amount, 0))}
          </p>
          <div className="bg-white border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-3">{t('finance.date')}</th>
                  <th className="text-left p-3">{t('finance.orderId')}</th>
                  <th className="text-right p-3">{t('finance.amount')}</th>
                  <th className="text-left p-3">{t('finance.payment')}</th>
                  <th className="text-left p-3">{t('finance.staff')}</th>
                </tr>
              </thead>
              <tbody>
                {displayedSales.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3">{new Date(r.date).toLocaleDateString()}</td>
                    <td className="p-3">{r.orderId}</td>
                    <td className="p-3 text-right">{formatTzs(r.amount)}</td>
                    <td className="p-3">{r.paymentMode}</td>
                    <td className="p-3">{r.staff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {displayedSales.length === 0 && <p className="p-4 text-slate-500">{t('finance.noSales')}</p>}
          </div>
        </div>
      )}

      {view === 'expenses' && expenseDetail && (
        <div className="space-y-4">
          <h2 className="font-medium">{t('finance.expensesByCategory')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(displayedByCategory).map(([cat, amt]) => (
              <div key={cat} className="bg-white border rounded p-4">
                <div className="text-sm text-slate-500">{cat}</div>
                <div className="font-semibold">{formatTzs(amt)}</div>
              </div>
            ))}
          </div>
          <h3 className="font-medium mt-6">{t('finance.expenseHistory')}</h3>
          <div className="bg-white border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-3">{t('finance.date')}</th>
                  <th className="text-left p-3">{t('finance.category')}</th>
                  <th className="text-right p-3">{t('finance.amount')}</th>
                  <th className="text-left p-3">{t('finance.notes')}</th>
                </tr>
              </thead>
              <tbody>
                {displayedExpenses.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="p-3">{new Date(e.date).toLocaleDateString()}</td>
                    <td className="p-3">{e.category}</td>
                    <td className="p-3 text-right">{formatTzs(e.amount)}</td>
                    <td className="p-3 text-slate-600">{e.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {displayedExpenses.length === 0 && <p className="p-4 text-slate-500">{t('finance.noExpenses')}</p>}
          </div>
        </div>
      )}

      {view === 'expenses' && !expenseDetail && <div className="text-slate-500">{t('finance.loadingExpenses')}</div>}

      {(isManagerLevel(user?.role) || user?.role === 'FINANCE') && (
        <div className="bg-white border rounded p-4 max-w-md">
          <h2 className="font-medium mb-2">{t('finance.recordExpense')}</h2>
          <CreateExpenseForm token={token} t={t} onCreated={() => { setData(null); goView('cards'); setExpenseDetail(null); }} />
        </div>
      )}
    </div>
  );
}

function CreateExpenseForm({ token, t, onCreated }: { token: string | null; t: (k: string) => string; onCreated: () => void }) {
  const [category, setCategory] = useState('HOUSEKEEPING');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !amount) return;
    setLoading(true);
    setMsg('');
    try {
      await api('/finance/expenses', {
        method: 'POST',
        token,
        body: JSON.stringify({ category, amount: parseFloat(amount), expenseDate, description: notes || undefined }),
      });
      setAmount('');
      setNotes('');
      setMsg(t('finance.expenseRecorded'));
      onCreated();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" required>
        <option value="HOUSEKEEPING">{t('finance.housekeeping')}</option>
        <option value="MAINTENANCE">{t('finance.maintenance')}</option>
        <option value="UTILITIES">{t('finance.utilities')}</option>
        <option value="OTHERS">{t('finance.others')}</option>
      </select>
      <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('finance.amountPlaceholder')} className="w-full px-3 py-2 border rounded text-sm" required />
      <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="w-full px-3 py-2 border rounded text-sm" required />
      <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('finance.notesOptional')} className="w-full px-3 py-2 border rounded text-sm" />
      <button type="submit" disabled={loading} className="px-4 py-2 bg-teal-600 text-white rounded text-sm disabled:opacity-50">{t('finance.record')}</button>
      {msg && <p className="text-sm text-green-600">{msg}</p>}
    </form>
  );
}

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}
