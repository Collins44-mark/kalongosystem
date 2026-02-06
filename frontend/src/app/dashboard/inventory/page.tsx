'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

type Item = { id: string; name: string; quantity: number; minQuantity: number; unitPrice: string };

export default function InventoryPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [lowStock, setLowStock] = useState<Item[]>([]);
  const [valueAtRisk, setValueAtRisk] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api<Item[]>('/inventory/items', { token }),
      api<Item[]>('/inventory/low-stock', { token }),
      api<number>('/inventory/value-at-risk', { token }),
    ])
      .then(([i, l, v]) => {
        setItems(i);
        setLowStock(l);
        setValueAtRisk(v);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Inventory</h1>
      {lowStock.length > 0 && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded">
          <h2 className="font-medium text-amber-800">Low Stock Alerts</h2>
          <div className="text-sm text-amber-700">
            {lowStock.map((i) => (
              <div key={i.id}>{i.name}: {i.quantity} (min: {i.minQuantity})</div>
            ))}
          </div>
          <div className="mt-2 text-sm">Value at risk: {formatTzs(valueAtRisk)}</div>
        </div>
      )}
      <div className="bg-white border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3">Item</th>
              <th className="text-right p-3">Qty</th>
              <th className="text-right p-3">Min</th>
              <th className="text-right p-3">Unit Price</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t">
                <td className="p-3">{i.name}</td>
                <td className="p-3 text-right">{i.quantity}</td>
                <td className="p-3 text-right">{i.minQuantity}</td>
                <td className="p-3 text-right">{formatTzs(parseFloat(i.unitPrice))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}
