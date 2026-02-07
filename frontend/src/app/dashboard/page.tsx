'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

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
  const { token } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [filter, setFilter] = useState<FilterOption>('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  const period = filter === 'bydate' ? 'month' : filter;

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

  if (loading && !data) return <div className="text-slate-500 p-6">Loading...</div>;
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
          <h1 className="text-xl font-semibold text-slate-800">Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Showing data for: {filter === 'today' ? 'Today' : filter === 'week' ? 'This Week' : filter === 'month' ? 'This Month' : dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : 'Select dates'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => fetchOverview()} className="px-3 py-1.5 text-sm text-teal-600 hover:underline">
            Refresh
          </button>
          <div className="flex rounded-full bg-slate-100 p-1 gap-0.5 transition-all duration-200">
            {(['today', 'week', 'month'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                  filter === f ? 'bg-white text-teal-600 shadow-sm ring-1 ring-teal-200' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                {f === 'today' ? 'Today' : f === 'week' ? 'This Week' : 'This Month'}
              </button>
            ))}
            <button
              onClick={() => setFilter('bydate')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                filter === 'bydate' ? 'bg-white text-teal-600 shadow-sm ring-1 ring-teal-200' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              By Date
            </button>
          </div>
          {filter === 'bydate' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-1.5 rounded-full border border-slate-200 text-sm"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-1.5 rounded-full border border-slate-200 text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Room Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="rounded-xl p-5 shadow-lg bg-[#0B3C5D] text-white min-h-[100px] flex flex-col justify-center">
          <div className="text-sm font-medium opacity-90">Total Rooms</div>
          <div className="text-2xl font-bold mt-0.5">{roomSummary.total}</div>
        </div>
        <RoomCard title="Occupied" value={roomSummary.occupied} variant="occupied" />
        <RoomCard title="Vacant" value={roomSummary.vacant} variant="vacant" />
        <RoomCard title="Reserved" value={roomSummary.reserved} variant="reserved" />
        <RoomCard title="Under Maintenance" value={roomSummary.underMaintenance} variant="maintenance" />
      </div>

      {/* Rooms List - same data as Front Office */}
      {rooms.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Rooms</h2>
            <p className="text-sm text-slate-500 mt-0.5">Room numbers by category — same as Front Office</p>
          </div>
          <div className="p-4 space-y-6">
            {(() => {
              const categoryMap = new Map<string, { id: string; name: string }>();
              rooms.forEach((r) => categoryMap.set(r.category.id, { id: r.category.id, name: r.category.name }));
              const byCategory = [...new Set(rooms.map((r) => r.category.id))].map((catId) => ({
                category: categoryMap.get(catId) || { id: catId, name: 'Other' },
                rooms: rooms.filter((r) => r.category.id === catId),
              })).sort((a, b) => a.category.name.localeCompare(b.category.name));
              return byCategory.map(({ category, rooms: catRooms }) => (
                <div key={category.id}>
                  <h3 className="text-sm font-medium text-slate-600 mb-2">{category.name}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {catRooms.map((r) => (
                      <div
                        key={r.id}
                        className={`p-3 rounded-lg border text-sm ${
                          r.status === 'VACANT' ? 'bg-slate-100 border-slate-300' :
                          r.status === 'OCCUPIED' ? 'bg-green-50 border-green-200' :
                          r.status === 'RESERVED' ? 'bg-amber-50 border-amber-200' :
                          'bg-red-50 border-red-200'
                        }`}
                      >
                        <div className="font-medium">{r.roomNumber}</div>
                        {r.roomName && <div className="text-xs text-slate-600">{r.roomName}</div>}
                        <div className="text-xs text-slate-500 mt-0.5">{r.status}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Sales Container */}
      <div className="bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Sales</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          <div className="p-5">
            <div className="text-sm text-slate-500">Total Revenue</div>
            <div className="text-xl font-bold text-slate-800 mt-1">{formatTzs(financeData.totalRevenue)}</div>
          </div>
          <div className="p-5">
            <div className="text-sm text-slate-500">Total Expenses</div>
            <div className="text-xl font-bold text-slate-800 mt-1">{formatTzs(financeData.totalExpenses)}</div>
          </div>
          <div className="p-5">
            <div className="text-sm text-slate-500">Net Profit</div>
            <div className={`text-xl font-bold mt-1 ${financeData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatTzs(financeData.netProfit)}
            </div>
          </div>
        </div>
      </div>

      {/* Inventory & Business Health */}
      <div className="bg-white rounded-xl shadow-md border border-slate-100 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            {lowStockCount}
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Inventory Alerts</h3>
            <p className="text-sm text-slate-500">Items below minimum stock</p>
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
            {health.label}
          </div>
          <span className="text-sm text-slate-500">Business Health</span>
        </div>
      </div>

      {/* Inventory Alerts Detail */}
      {lowStockCount > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-slate-100 p-5">
          <h3 className="font-semibold text-slate-800 mb-3">Low Stock Items</h3>
          <div className="space-y-2">
            {displayData.inventoryAlerts.lowStock.map((item) => (
              <div
                key={item.id}
                className={`text-sm py-2 ${item.severity === 'RED' ? 'text-red-600' : 'text-amber-600'}`}
              >
                {item.name}: {item.quantity} (min: {item.minQuantity})
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Value at risk: {formatTzs(displayData.inventoryAlerts.totalValueAtRisk)}
          </p>
        </div>
      )}

      {/* Performance Graph */}
      <div className="bg-white rounded-xl shadow-md border border-slate-100 p-5">
        <h3 className="font-semibold text-slate-800 mb-4">Performance by Sector</h3>
        <div className="space-y-4">
          {(['hotel', 'bar', 'restaurant'] as const).map((sector) => (
            <div key={sector} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 capitalize">{sector === 'hotel' ? 'Hotel / Rooms' : sector}</span>
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

function getHealthStatus(netProfit: number, totalRevenue: number): { label: string; color: string } {
  if (totalRevenue === 0) return { label: 'Average', color: 'grey' };
  const margin = netProfit / totalRevenue;
  if (margin >= 0.2) return { label: 'Excellent', color: 'green' };
  if (margin >= 0.05) return { label: 'Good', color: 'lightgreen' };
  if (margin >= 0) return { label: 'Average', color: 'grey' };
  return { label: 'Low', color: 'red' };
}

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency: 'TZS',
    maximumFractionDigits: 0,
  }).format(n);
}
