'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

type DashboardData = {
  roomSummary: { total: number; occupied: number; vacant: number; reserved: number; underMaintenance: number };
  financeSummary: { totalRevenue: number; totalExpenses: number; netProfit: number };
  inventoryAlerts: {
    lowStock: { id: string; name: string; quantity: number; minQuantity: number; severity: string }[];
    totalValueAtRisk: number;
  };
  salesBySector: { bar: number; restaurant: number; hotel: number; total: number };
  period: string;
};

export default function OverviewPage() {
  const { token } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api<DashboardData>(`/overview?period=${period}`, { token })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [token, period]);

  if (loading) return <div className="text-slate-500">Loading...</div>;
  if (!data) return <div className="text-red-600">Failed to load overview</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Overview</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as typeof period)}
          className="px-3 py-1 border rounded text-sm"
        >
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card title="Total Rooms" value={data.roomSummary.total} />
        <Card title="Occupied" value={data.roomSummary.occupied} />
        <Card title="Vacant" value={data.roomSummary.vacant} />
        <Card title="Reserved" value={data.roomSummary.reserved} />
        <Card title="Under Maintenance" value={data.roomSummary.underMaintenance} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Total Revenue" value={data.financeSummary.totalRevenue} format="currency" />
        <Card title="Total Expenses" value={data.financeSummary.totalExpenses} format="currency" />
        <Card
          title="Net Profit"
          value={data.financeSummary.netProfit}
          format="currency"
          color={data.financeSummary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}
        />
      </div>

      {data.inventoryAlerts.lowStock.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h2 className="font-medium mb-2">Inventory Alerts</h2>
          <div className="space-y-1">
            {data.inventoryAlerts.lowStock.map((item) => (
              <div
                key={item.id}
                className={`text-sm ${item.severity === 'RED' ? 'text-red-600' : 'text-amber-600'}`}
              >
                {item.name}: {item.quantity} (min: {item.minQuantity})
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Value at risk: {formatCurrency(data.inventoryAlerts.totalValueAtRisk)}
          </p>
        </div>
      )}

      <div className="bg-white rounded-lg border p-4">
        <h2 className="font-medium mb-2">Sales by Sector</h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>Bar: {formatCurrency(data.salesBySector.bar)}</div>
          <div>Restaurant: {formatCurrency(data.salesBySector.restaurant)}</div>
          <div>Hotel: {formatCurrency(data.salesBySector.hotel)}</div>
        </div>
        <div className="mt-2 font-medium">
          Total: {formatCurrency(data.salesBySector.total)}
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  format,
  color,
}: {
  title: string;
  value: number;
  format?: 'currency';
  color?: string;
}) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="text-sm text-slate-500">{title}</div>
      <div className={`text-xl font-semibold ${color || ''}`}>
        {format === 'currency' ? formatCurrency(value) : value}
      </div>
    </div>
  );
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency: 'TZS',
    maximumFractionDigits: 0,
  }).format(n);
}
