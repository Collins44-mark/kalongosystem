'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isManagerLevel } from '@/lib/roles';
import { defaultDashboardRoute } from '@/lib/homeRoute';

type Room = { id: string; roomNumber: string; roomName?: string; status: string; category: { id: string; name: string; pricePerNight: string } };

type DashboardData = {
  roomSummary: { total: number; occupied: number; vacant: number; reserved: number; underMaintenance: number };
  rooms?: Room[];
  inventoryAlerts: {
    lowStock: { id: string; name: string; quantity: number; minQuantity: number; severity: string }[];
    totalValueAtRisk: number;
  };
  period: string;
};

type FinanceData = {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  bySector: { bar: number; restaurant: number; hotel: number };
};

const EMPTY_DASHBOARD: Omit<DashboardData, 'period'> = {
  roomSummary: { total: 0, occupied: 0, vacant: 0, reserved: 0, underMaintenance: 0 },
  inventoryAlerts: { lowStock: [], totalValueAtRisk: 0 },
};

const EMPTY_FINANCE: FinanceData = {
  totalRevenue: 0,
  totalExpenses: 0,
  netProfit: 0,
  bySector: { bar: 0, restaurant: 0, hotel: 0 },
};

type FilterOption = 'today' | 'week' | 'month' | 'bydate';

export default function OverviewPage() {
  const router = useRouter();
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [filter, setFilter] = useState<FilterOption>('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  const period = filter === 'bydate' ? 'month' : filter;

  // Overview is MANAGER-only. Other roles go straight to their module.
  useEffect(() => {
    if (!user?.role) return;
    if (!isManagerLevel(user.role)) {
      router.replace(defaultDashboardRoute(user.role));
    }
  }, [user?.role, router]);

  const { financeFrom, financeTo } = (() => {
    const now = new Date();
    if (filter === 'bydate' && dateFrom && dateTo) {
      return { financeFrom: dateFrom, financeTo: dateTo };
    }
    if (filter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { financeFrom: start.toISOString().slice(0, 10), financeTo: end.toISOString().slice(0, 10) };
    }
    if (filter === 'week') {
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { financeFrom: start.toISOString().slice(0, 10), financeTo: end.toISOString().slice(0, 10) };
    }
    if (filter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { financeFrom: start.toISOString().slice(0, 10), financeTo: now.toISOString().slice(0, 10) };
    }
    return { financeFrom: '', financeTo: '' };
  })();

  function fetchOverview() {
    if (!token) return;
    setLoading(true);
    const emptyData: DashboardData = { ...EMPTY_DASHBOARD, period };
    api<DashboardData>(`/overview?period=${period}`, { token })
      .then((res) => setData({ ...res, period }))
      .catch(() => setData(emptyData))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchOverview();
  }, [token, period]);

  // Fallback: if overview has no rooms, fetch directly from same API as Front Office
  useEffect(() => {
    if (!token || loading || !data) return;
    if ((data.rooms?.length ?? 0) > 0 || (data.roomSummary?.total ?? 0) > 0) return;
    api<Room[]>('/hotel/rooms', { token })
      .then((rooms) => {
        const summary = { total: rooms.length, occupied: rooms.filter((r) => r.status === 'OCCUPIED').length, vacant: rooms.filter((r) => r.status === 'VACANT').length, reserved: rooms.filter((r) => r.status === 'RESERVED').length, underMaintenance: rooms.filter((r) => r.status === 'UNDER_MAINTENANCE').length };
        setData((prev) => prev ? { ...prev, rooms, roomSummary: summary } : prev);
      })
      .catch(() => {});
  }, [token, loading, data]);

  // Refresh when page becomes visible (e.g. user returns from Front Office after adding rooms)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && token) {
        setLoading(true);
        const emptyData: DashboardData = { ...EMPTY_DASHBOARD, period };
        api<DashboardData>(`/overview?period=${period}`, { token })
          .then(setData)
          .catch(() => setData(emptyData))
          .finally(() => setLoading(false));
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [token, period]);

  // Refetch when Front Office updates rooms (cross-tab)
  useEffect(() => {
    if (!token) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'hms-data-updated') fetchOverview();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [token, period]);

  // Auto-refresh every 30s when visible so room counts/amounts stay current
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        const emptyData: DashboardData = { ...EMPTY_DASHBOARD, period };
        api<DashboardData>(`/overview?period=${period}`, { token })
          .then(setData)
          .catch(() => setData(emptyData));
        const params = new URLSearchParams();
        if (financeFrom) params.set('from', financeFrom);
        if (financeTo) params.set('to', financeTo);
        api<FinanceData>(`/finance/dashboard?${params}`, { token })
          .then(setFinance)
          .catch(() => setFinance(EMPTY_FINANCE));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [token, period, financeFrom, financeTo]);

  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams();
    if (financeFrom) params.set('from', financeFrom);
    if (financeTo) params.set('to', financeTo);
    api<FinanceData>(`/finance/dashboard?${params}`, { token })
      .then(setFinance)
      .catch(() => setFinance(EMPTY_FINANCE));
  }, [token, financeFrom, financeTo]);

  if (loading && !data) return <div className="text-slate-500 p-6">{t('common.loading')}</div>;
  const displayData = data ?? { ...EMPTY_DASHBOARD, period };
  const rooms = displayData.rooms ?? [];
  const roomSummary = (() => {
    const s = displayData.roomSummary;
    if (s.total > 0) return s;
    if (rooms.length === 0) return s;
    return {
      total: rooms.length,
      occupied: rooms.filter((r) => r.status === 'OCCUPIED').length,
      vacant: rooms.filter((r) => r.status === 'VACANT').length,
      reserved: rooms.filter((r) => r.status === 'RESERVED').length,
      underMaintenance: rooms.filter((r) => r.status === 'UNDER_MAINTENANCE').length,
    };
  })();
  const financeData = finance ?? EMPTY_FINANCE;

  const lowStockCount = displayData.inventoryAlerts.lowStock.length;
  const health = getHealthStatus(financeData.netProfit, financeData.totalRevenue);

  const maxSector = Math.max(
    financeData.bySector.hotel,
    financeData.bySector.bar,
    financeData.bySector.restaurant,
    1
  );

  return (
    <div className="space-y-6">
      {/* Header + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{t('overview.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t('overview.showingData')} {filter === 'today' ? t('overview.today') : filter === 'week' ? t('overview.thisWeek') : filter === 'month' ? t('overview.thisMonth') : dateFrom && dateTo ? `${dateFrom} ${t('common.to')} ${dateTo}` : t('common.selectDates')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => fetchOverview()} className="px-3 py-1.5 text-sm text-teal-600 hover:underline">
            {t('common.refresh')}
          </button>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterOption)}
            className="px-3 py-2 border rounded text-sm bg-white"
          >
            <option value="today">{t('overview.today')}</option>
            <option value="week">{t('overview.thisWeek')}</option>
            <option value="month">{t('overview.thisMonth')}</option>
            <option value="bydate">{t('overview.byDate')}</option>
          </select>
          {filter === 'bydate' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 border rounded text-sm bg-white"
              />
              <span className="text-slate-400 text-sm">{t('common.to')}</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 border rounded text-sm bg-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* Room Status Cards */}
      <Link href="/dashboard/front-office" className="block">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-xl p-5 shadow-lg bg-[#0B3C5D] text-white min-h-[100px] flex flex-col justify-center hover:opacity-95 transition-opacity">
            <div className="text-sm font-medium opacity-90">{t('overview.totalRooms')}</div>
            <div className="text-2xl font-bold mt-0.5">{roomSummary.total}</div>
          </div>
          <RoomCard title={t('overview.occupied')} value={roomSummary.occupied} variant="occupied" />
          <RoomCard title={t('overview.vacant')} value={roomSummary.vacant} variant="vacant" />
          <RoomCard title={t('overview.reserved')} value={roomSummary.reserved} variant="reserved" />
          <RoomCard title={t('overview.underMaintenance')} value={roomSummary.underMaintenance} variant="maintenance" />
        </div>
      </Link>

      {/* Sales Container */}
      <Link href="/dashboard/finance" className="block">
        <div className="bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden hover:border-teal-200 transition-colors">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">{t('overview.sales')}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          <div className="p-5">
            <div className="text-sm text-slate-500">{t('overview.totalRevenue')}</div>
            <div className="text-xl font-bold text-slate-800 mt-1">{formatTzs(financeData.totalRevenue)}</div>
          </div>
          <div className="p-5">
            <div className="text-sm text-slate-500">{t('overview.totalExpenses')}</div>
            <div className="text-xl font-bold text-slate-800 mt-1">{formatTzs(financeData.totalExpenses)}</div>
          </div>
          <div className="p-5">
            <div className="text-sm text-slate-500">{t('overview.netProfit')}</div>
            <div className={`text-xl font-bold mt-1 ${financeData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatTzs(financeData.netProfit)}
            </div>
          </div>
        </div>
        </div>
      </Link>

      {/* Inventory & Business Health */}
      <Link href="/dashboard/bar?filter=low" className="block">
        <div className="bg-white rounded-xl shadow-md border border-slate-100 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-6 hover:border-teal-200 transition-colors">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            {lowStockCount}
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">{t('overview.inventoryAlerts')}</h3>
            <p className="text-sm text-slate-500">{t('overview.itemsBelowMin')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`px-4 py-2 rounded-full font-medium text-sm ${
              health.color === 'green' ? 'bg-green-100 text-green-800' :
              health.color === 'lightgreen' ? 'bg-emerald-100 text-emerald-800' :
              health.color === 'grey' ? 'bg-slate-100 text-slate-700' :
              'bg-red-100 text-red-800'
            }`}
          >
            {t(health.labelKey)}
          </div>
          <span className="text-sm text-slate-500">{t('overview.businessHealth')}</span>
        </div>
        </div>
      </Link>

      {/* Inventory Alerts Detail */}
      {lowStockCount > 0 && (
        <Link href="/dashboard/bar?filter=low" className="block">
          <div className="bg-white rounded-xl shadow-md border border-slate-100 p-5 hover:border-teal-200 transition-colors">
            <h3 className="font-semibold text-slate-800 mb-3">{t('overview.lowStockItems')}</h3>
            <div className="space-y-2">
              {displayData.inventoryAlerts.lowStock.map((item) => (
                <div
                  key={item.id}
                  className={`text-sm py-2 ${item.severity === 'RED' ? 'text-red-600' : 'text-amber-600'}`}
                >
                  {item.name}: {item.quantity} ({t('common.min')}: {item.minQuantity})
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {t('overview.valueAtRisk')}: {formatTzs(displayData.inventoryAlerts.totalValueAtRisk)}
            </p>
          </div>
        </Link>
      )}

      {/* Performance Graph */}
      <Link href="/dashboard/finance" className="block">
        <div className="bg-white rounded-xl shadow-md border border-slate-100 p-5 hover:border-teal-200 transition-colors">
        <h3 className="font-semibold text-slate-800 mb-4">{t('overview.performanceBySector')}</h3>
        <div className="space-y-4">
          {(['hotel', 'bar', 'restaurant'] as const).map((sector) => (
            <div key={sector} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 capitalize">{sector === 'hotel' ? t('overview.hotelRooms') : sector}</span>
                <span className="font-medium text-slate-800">{formatTzs(financeData.bySector[sector])}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-teal-500 transition-all"
                  style={{ width: `${(financeData.bySector[sector] / maxSector) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        </div>
      </Link>
    </div>
  );
}

function RoomCard({ title, value, variant }: { title: string; value: number; variant: 'occupied' | 'vacant' | 'reserved' | 'maintenance' }) {
  const styles = {
    occupied: 'border-2 border-green-400 ring-2 ring-green-100 bg-white',
    vacant: 'border-2 border-slate-300 ring-2 ring-slate-100 bg-white',
    reserved: 'border-2 border-amber-400 ring-2 ring-amber-100 bg-white',
    maintenance: 'border-2 border-red-400 ring-2 ring-red-100 bg-white',
  };
  const valueColor = variant === 'occupied' ? 'text-green-600' : variant === 'vacant' ? 'text-slate-700' : variant === 'maintenance' ? 'text-red-600' : variant === 'reserved' ? 'text-amber-700' : 'text-slate-800';
  return (
    <div className={`rounded-xl p-5 shadow-md min-h-[100px] flex flex-col justify-center ${styles[variant]}`}>
      <div className="text-sm text-slate-500">{title}</div>
      <div className={`text-2xl font-bold mt-0.5 ${valueColor}`}>{value}</div>
    </div>
  );
}

function getHealthStatus(netProfit: number, totalRevenue: number): { labelKey: string; color: string } {
  if (totalRevenue === 0) return { labelKey: 'overview.average', color: 'grey' };
  const margin = netProfit / totalRevenue;
  if (margin >= 0.2) return { labelKey: 'overview.excellent', color: 'green' };
  if (margin >= 0.05) return { labelKey: 'overview.good', color: 'lightgreen' };
  if (margin >= 0) return { labelKey: 'overview.average', color: 'grey' };
  return { labelKey: 'overview.low', color: 'red' };
}

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency: 'TZS',
    maximumFractionDigits: 0,
  }).format(n);
}
