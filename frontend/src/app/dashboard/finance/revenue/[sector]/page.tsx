'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { isManagerLevel } from '@/lib/roles';
import { useSearch } from '@/store/search';

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type Period = 'today' | 'week' | 'month' | 'bydate';
type Sector = 'all' | 'rooms' | 'bar' | 'restaurant' | 'other';

type TxnRow = {
  date: string;
  referenceId: string;
  sector: 'rooms' | 'bar' | 'restaurant' | 'other';
  category?: string;
  description?: string;
  createdAt?: string;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  paymentMode: string;
};

function normalizeSectorParam(raw: string): Sector {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'rooms' || s === 'bar' || s === 'restaurant' || s === 'other') return s;
  return 'rooms';
}

export default function FinanceRevenueSectorPage() {
  const router = useRouter();
  const params = useParams<{ sector?: string }>();
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const searchQuery = useSearch((s) => s.query);

  const isManager = isManagerLevel(user?.role);
  const isFinance = user?.role === 'FINANCE';
  const canAccess = isManager || isFinance;

  const sectorFromUrl = normalizeSectorParam(String(params?.sector ?? 'rooms'));
  const [sector, setSector] = useState<Sector>(sectorFromUrl);

  const [period, setPeriod] = useState<Period>('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [txLoading, setTxLoading] = useState(false);
  const [tx, setTx] = useState<{ total: number; rows: TxnRow[] }>({ total: 0, rows: [] });
  const [selected, setSelected] = useState<TxnRow | null>(null);

  useEffect(() => {
    setSector(sectorFromUrl);
    setPage(1);
  }, [sectorFromUrl]);

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
    setTxLoading(true);
    const qs = new URLSearchParams();
    qs.set('period', period);
    if (period === 'bydate' && dateFrom && dateTo) {
      qs.set('from', dateFrom);
      qs.set('to', dateTo);
    }
    qs.set('sector', sector);
    qs.set('page', String(page));
    qs.set('pageSize', String(pageSize));
    api<{ total: number; rows: TxnRow[] }>(`/finance/transactions?${qs}`, { token })
      .then((res: any) => setTx({ total: Number(res?.total || 0), rows: Array.isArray(res?.rows) ? res.rows : [] }))
      .catch(() => setTx({ total: 0, rows: [] }))
      .finally(() => setTxLoading(false));
  }, [token, period, dateFrom, dateTo, sector, page, pageSize]);

  const q = (searchQuery || '').trim().toLowerCase();
  const displayedRows = useMemo(() => {
    if (!q) return tx.rows;
    return tx.rows.filter((r) => {
      const txt = `${r.date} ${r.createdAt || ''} ${r.referenceId} ${r.sector} ${r.category || ''} ${r.description || ''} ${r.paymentMode} ${r.netAmount} ${r.vatAmount} ${r.grossAmount}`.toLowerCase();
      return txt.includes(q);
    });
  }, [q, tx.rows]);

  const totalPages = Math.max(1, Math.ceil((tx.total || 0) / pageSize));

  const formatTzs = (n: number) =>
    new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n || 0);

  function labelSector(s: Sector) {
    if (s === 'rooms') return t('finance.roomsRevenue');
    if (s === 'bar') return t('bar.title');
    if (s === 'restaurant') return t('restaurant.title');
    if (s === 'other') return t('finance.otherRevenue');
    return t('finance.allSectors');
  }

  if (!canAccess) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-4">{t('finance.title')}</h1>
        <p className="text-slate-600">{t('finance.onlyManagers')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t('finance.totalRevenue')}</h1>
          <div className="text-sm text-slate-500 mt-1">
            {labelSector(sector)} · {dateRange.from} — {dateRange.to}
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push('/dashboard/finance/revenue')}
          className="text-sm text-slate-600 hover:text-slate-800 hover:underline"
        >
          {t('common.back')}
        </button>
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
          <select
            value={sector}
            onChange={(e) => {
              const next = e.target.value as Sector;
              if (next === 'all') {
                router.push('/dashboard/finance/revenue');
                return;
              }
              router.push(`/dashboard/finance/revenue/${next}`);
            }}
            className="px-3 py-2 border rounded text-sm bg-white"
          >
            <option value="all">{t('finance.allSectors')}</option>
            <option value="rooms">{t('finance.roomsRevenue')}</option>
            <option value="bar">{t('bar.title')}</option>
            <option value="restaurant">{t('restaurant.title')}</option>
            <option value="other">{t('finance.otherRevenue')}</option>
          </select>
        </div>
      </div>

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
                {sector === 'other' ? (
                  <th className="p-3 font-medium">{t('finance.category')}</th>
                ) : (
                  <th className="p-3 font-medium">{t('finance.referenceId')}</th>
                )}
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
                  <tr
                    key={`${r.referenceId}-${idx}`}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => setSelected(r)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelected(r); }}
                  >
                    <td className="p-3 whitespace-nowrap">{new Date(r.date).toLocaleString()}</td>
                    {sector === 'other' ? (
                      <td className="p-3">{r.category || '-'}</td>
                    ) : (
                      <td className="p-3 font-mono text-xs">{r.referenceId}</td>
                    )}
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

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto overscroll-contain touch-none" style={{ overscrollBehavior: 'contain' }}>
          <div className="bg-white rounded-lg w-full max-w-lg p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-slate-900">{t('finance.transactionDetails')}</div>
                <div className="text-xs text-slate-500 mt-1">{labelSector(sector)}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-sm text-slate-600 hover:text-slate-800 hover:underline">
                {t('common.close')}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-50 border rounded p-3">
                <div className="text-xs text-slate-500">{t('finance.referenceId')}</div>
                <div className="font-mono text-xs mt-1 break-all">{selected.referenceId}</div>
              </div>
              <div className="bg-slate-50 border rounded p-3">
                <div className="text-xs text-slate-500">{t('finance.category')}</div>
                <div className="mt-1">{selected.category || '-'}</div>
              </div>
              <div className="bg-slate-50 border rounded p-3 sm:col-span-2">
                <div className="text-xs text-slate-500">{t('finance.descriptionOptional')}</div>
                <div className="mt-1 text-slate-800 whitespace-pre-wrap break-words">{selected.description || '-'}</div>
              </div>
              <div className="bg-slate-50 border rounded p-3">
                <div className="text-xs text-slate-500">{t('finance.netAmount')}</div>
                <div className="mt-1 font-medium">{formatTzs(selected.netAmount)}</div>
              </div>
              <div className="bg-slate-50 border rounded p-3">
                <div className="text-xs text-slate-500">{t('finance.vatAmount')}</div>
                <div className="mt-1 font-medium">{formatTzs(selected.vatAmount)}</div>
              </div>
              <div className="bg-slate-50 border rounded p-3">
                <div className="text-xs text-slate-500">{t('finance.grossAmount')}</div>
                <div className="mt-1 font-medium">{formatTzs(selected.grossAmount)}</div>
              </div>
              <div className="bg-slate-50 border rounded p-3">
                <div className="text-xs text-slate-500">{t('finance.paymentMode')}</div>
                <div className="mt-1">{selected.paymentMode || '-'}</div>
              </div>
              <div className="bg-slate-50 border rounded p-3 sm:col-span-2">
                <div className="text-xs text-slate-500">{t('finance.createdAt')}</div>
                <div className="mt-1">
                  {new Date(selected.createdAt || selected.date).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setSelected(null)} className="px-4 py-2 bg-slate-200 rounded hover:bg-slate-300">
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

