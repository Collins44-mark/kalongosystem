'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

type DashboardData = {
  roomSummary: { total: number; occupied: number; vacant: number; reserved: number; underMaintenance: number };
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
  const effectiveFrom = filter === 'bydate' && dateFrom ? dateFrom : '';
  const effectiveTo = filter === 'bydate' && dateTo ? dateTo : '';

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const emptyData: DashboardData = { ...EMPTY_DASHBOARD, period };
    api<DashboardData>(`/overview?period=${period}`, { token })
      .then(setData)
      .catch(() => setData(emptyData))
      .finally(() => setLoading(false));
  }, [token, period]);

  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams();
    if (effectiveFrom) params.set('from', effectiveFrom);
    if (effectiveTo) params.set('to', effectiveTo);
    api<FinanceData>(`/finance/dashboard?${params}`, { token })
      .then(setFinance)
      .catch(() => setFinance(EMPTY_FINANCE));
  }, [token, effectiveFrom, effectiveTo]);

  if (loading && !data) return <div className="text-slate-500 p-6">Loading...</div>;
  const displayData = data ?? { ...EMPTY_DASHBOARD, period };
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
        <h1 className="text-xl font-semibold text-slate-800">Overview</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full bg-slate-100 p-1 gap-0.5">
            {(['today', 'week', 'month'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  filter === f ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                {f === 'today' ? 'Today' : f === 'week' ? 'This Week' : 'This Month'}
              </button>
            ))}
            <button
              onClick={() => setFilter('bydate')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                filter === 'bydate' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'
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
          <div className="text-2xl font-bold mt-0.5">{displayData.roomSummary.total}</div>
        </div>
        <RoomCard title="Occupied" value={displayData.roomSummary.occupied} variant="occupied" />
        <RoomCard title="Vacant" value={displayData.roomSummary.vacant} variant="vacant" />
        <RoomCard title="Reserved" value={displayData.roomSummary.reserved} variant="reserved" />
        <RoomCard title="Under Maintenance" value={displayData.roomSummary.underMaintenance} variant="maintenance" />
      </div>

      {/* Sales Summary Container */}
      <div className="bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Sales Summary</h2>
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
    vacant: 'border border-slate-200 bg-white',
    reserved: 'border border-slate-300 bg-white',
    maintenance: 'border-2 border-red-400 ring-2 ring-red-100 bg-white',
  };
  const valueColor = variant === 'occupied' ? 'text-green-600' : variant === 'maintenance' ? 'text-red-600' : 'text-slate-800';
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
