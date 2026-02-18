'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { useRouter } from 'next/navigation';
import { isManagerLevel } from '@/lib/roles';
import { defaultDashboardRoute } from '@/lib/homeRoute';

type Room = { id: string; roomNumber: string; roomName?: string; status: string; category: { id: string; name: string; pricePerNight: string } };
type BarItem = { id: string; name: string; price: string; stock: number | null; minQuantity: number | null };

type DashboardData = {
  roomSummary: { total: number; occupied: number; vacant: number; reserved: number; underMaintenance: number };
  rooms?: Room[];
  inventoryAlerts: {
    lowStock: { id: string; name: string; quantity: number; minQuantity: number; severity: string }[];
    barLowStockCount?: number;
    barLowStock?: { id: string; name: string; quantity: number; minQuantity: number }[];
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
  inventoryAlerts: { lowStock: [], barLowStockCount: 0, barLowStock: [], totalValueAtRisk: 0 },
};

const EMPTY_FINANCE: FinanceData = {
  totalRevenue: 0,
  totalExpenses: 0,
  netProfit: 0,
  bySector: { bar: 0, restaurant: 0, hotel: 0 },
};

type FilterOption = 'today' | 'week' | 'month' | 'bydate';

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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
    if (filter === 'bydate') {
      return { financeFrom: toLocalDateString(now), financeTo: toLocalDateString(now) };
    }
    if (filter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { financeFrom: toLocalDateString(start), financeTo: toLocalDateString(end) };
    }
    if (filter === 'week') {
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { financeFrom: toLocalDateString(start), financeTo: toLocalDateString(end) };
    }
    if (filter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { financeFrom: toLocalDateString(start), financeTo: toLocalDateString(now) };
    }
    return { financeFrom: '', financeTo: '' };
  })();

  function fetchOverview() {
    if (!token) return;
    setLoading(true);
    const emptyData: DashboardData = { ...EMPTY_DASHBOARD, period };
    // Fetch overview, hotel rooms, and bar items (same API as Bar page) so Bar alerts match Bar page
    const overviewPromise = api<DashboardData>(`/overview?period=${period}`, { token })
      .then((res) => ({ ...res, period }))
      .catch((err) => {
        if (err?.status === 401 || err?.status === 403) return null;
        return emptyData;
      });
    const roomsPromise = api<Room[]>('/hotel/rooms', { token })
      .then((rooms): { rooms: Room[]; roomSummary: DashboardData['roomSummary'] } | null => {
        const summary = {
          total: rooms.length,
          occupied: rooms.filter((r) => r.status === 'OCCUPIED').length,
          vacant: rooms.filter((r) => r.status === 'VACANT').length,
          reserved: rooms.filter((r) => r.status === 'RESERVED').length,
          underMaintenance: rooms.filter((r) => r.status === 'UNDER_MAINTENANCE').length,
        };
        return { rooms, roomSummary: summary };
      })
      .catch(() => null);
    const barItemsPromise = api<BarItem[]>('/bar/items', { token })
      .then((items): { barLowStockCount: number; barLowStock: { id: string; name: string; quantity: number; minQuantity: number }[] } | null => {
        // Same logic as Bar page: low = min set and (stock <= min or out of stock)
        const low = items.filter((i) => {
          const stock = i.stock ?? 0;
          const min = i.minQuantity ?? null;
          return min != null && (stock <= min || stock === 0);
        });
        return {
          barLowStockCount: low.length,
          barLowStock: low.map((i) => ({
            id: i.id,
            name: i.name,
            quantity: i.stock ?? 0,
            minQuantity: i.minQuantity ?? 0,
          })),
        };
      })
      .catch(() => null);

    Promise.all([overviewPromise, roomsPromise, barItemsPromise])
      .then(([overviewRes, roomsRes, barRes]) => {
        const base = overviewRes ?? emptyData;
        let next = base;
        if (roomsRes && (roomsRes.rooms.length > 0 || roomsRes.roomSummary.total > 0)) {
          next = { ...next, rooms: roomsRes.rooms, roomSummary: roomsRes.roomSummary };
        }
        if (barRes) {
          next = {
            ...next,
            inventoryAlerts: {
              ...next.inventoryAlerts,
              barLowStockCount: barRes.barLowStockCount,
              barLowStock: barRes.barLowStock,
            },
          };
        }
        setData(next);
      })
      .catch(() => setData(emptyData))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchOverview();
  }, [token, period]);

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

      {/* Sales Container */}
      <div className="bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden">
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

      {/* Bar alerts - reflects bar sector items below minimum stock */}
      <div className="bg-white rounded-xl shadow-md border border-slate-100 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            {displayData.inventoryAlerts.barLowStockCount ?? 0}
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">{t('overview.barAlerts')}</h3>
            <p className="text-sm text-slate-500">{t('overview.barItemsBelowMin')}</p>
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

      {/* Bar alerts detail - bar items below minimum */}
      {(displayData.inventoryAlerts.barLowStockCount ?? 0) > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-slate-100 p-5">
            <h3 className="font-semibold text-slate-800 mb-3">{t('overview.barAlerts')}</h3>
            <div className="space-y-2">
              {(displayData.inventoryAlerts.barLowStock ?? []).map((item) => (
                <div
                  key={item.id}
                  className={`text-sm py-2 ${item.quantity === 0 ? 'text-red-600' : 'text-amber-600'}`}
                >
                  {item.name}: {item.quantity} ({t('common.min')}: {item.minQuantity})
                </div>
              ))}
            </div>
          </div>
      )}

      {/* Performance Graph */}
      <div className="bg-white rounded-xl shadow-md border border-slate-100 p-5">
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
