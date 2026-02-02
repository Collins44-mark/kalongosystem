'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { RoleGuard } from '@/components/RoleGuard';

type OrderItem = { id: number; menu_item_name: string; quantity: number; unit_price: string; line_total: string };
type Order = {
  id: number;
  sector: string;
  status: string;
  table_or_room: string;
  created_at: string;
  items: OrderItem[];
};

const statusOrder = ['new', 'preparing', 'ready', 'served'];

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = () => {
    api
      .get<Order[] | { results: Order[] }>('/api/kitchen/orders/')
      .then((r) => setOrders(Array.isArray(r) ? r : (r.results || [])))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
    const t = setInterval(fetchOrders, 10000);
    return () => clearInterval(t);
  }, []);

  const updateStatus = async (orderId: number, status: string) => {
    try {
      await api.patch(`/api/orders/${orderId}/status/`, { status });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    } catch (e) {
      alert((e as { detail?: string }).detail || 'Failed');
    }
  };

  const nextStatus = (current: string) => {
    const i = statusOrder.indexOf(current);
    return i < statusOrder.length - 1 ? statusOrder[i + 1] : current;
  };

  if (loading) return <div className="text-slate-500">Loading…</div>;

  return (
    <RoleGuard permission="update_pos_order" fallback={<p className="text-slate-500">No access.</p>}>
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-8">Kitchen display</h1>
        <p className="text-slate-600 mb-6">Orders update in real time. Advance status: New → Preparing → Ready → Served.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orders.map((order) => (
            <div key={order.id} className="card border-l-4 border-l-primary-500">
              <div className="flex justify-between items-start mb-2">
                <span className="font-semibold text-slate-800">#{order.id} {order.sector}</span>
                <span className="text-sm text-slate-500">{order.table_or_room || '—'}</span>
              </div>
              <p className="text-xs text-slate-500 mb-3">{new Date(order.created_at).toLocaleString()}</p>
              <ul className="space-y-1 mb-4">
                {order.items?.map((item) => (
                  <li key={item.id} className="text-sm">
                    {item.menu_item_name} × {item.quantity}
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between">
                <span className="px-2 py-1 rounded text-xs bg-slate-200 text-slate-700 capitalize">{order.status}</span>
                {order.status !== 'served' && order.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => updateStatus(order.id, nextStatus(order.status))}
                    className="btn-primary text-sm"
                  >
                    → {nextStatus(order.status)}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {orders.length === 0 && <p className="text-slate-500 text-center py-12">No active orders.</p>}
      </div>
    </RoleGuard>
  );
}
