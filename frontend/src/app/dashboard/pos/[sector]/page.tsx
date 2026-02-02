'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { RoleGuard } from '@/components/RoleGuard';

type MenuItem = { id: number; name: string; price: string };
type OrderItem = { menu_item_id: number; quantity: number; notes?: string };

const PAY_NOW = 'pay_now';
const POST_ROOM = 'post_to_room';

export default function POSPage() {
  const params = useParams();
  const sector = (params?.sector as string) || 'restaurant';
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [paymentIntent, setPaymentIntent] = useState<'pay_now' | 'post_to_room'>(PAY_NOW);
  const [folioId, setFolioId] = useState<string>('');
  const [tableOrRoom, setTableOrRoom] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ results?: MenuItem[] }>(`/api/menu-items/?menu__sector=${sector}`)
      .then((r) => setItems(Array.isArray(r) ? r : (r.results || [])))
      .catch(() => setError('Failed to load menu'));
  }, [sector]);

  const addToCart = (id: number, qty = 1) => {
    setCart((prev) => {
      const i = prev.findIndex((c) => c.menu_item_id === id);
      if (i >= 0) {
        const next = [...prev];
        next[i].quantity += qty;
        return next;
      }
      return [...prev, { menu_item_id: id, quantity: qty }];
    });
  };

  const removeFromCart = (id: number) => {
    setCart((prev) => prev.filter((c) => c.menu_item_id !== id));
  };

  const total = cart.reduce((acc, c) => {
    const item = items.find((i) => i.id === c.menu_item_id);
    return acc + (item ? Number(item.price) * c.quantity : 0);
  }, 0);

  const submitOrder = async () => {
    if (cart.length === 0) {
      setError('Add items to cart');
      return;
    }
    if (paymentIntent === POST_ROOM && !folioId) {
      setError('Enter folio ID for Post to Room');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/orders/', {
        sector,
        payment_intent: paymentIntent,
        folio_id: paymentIntent === POST_ROOM ? Number(folioId) : null,
        table_or_room: tableOrRoom,
        items: cart.map((c) => ({ menu_item_id: c.menu_item_id, quantity: c.quantity, notes: c.notes || '' })),
      });
      setCart([]);
      setError(null);
      alert('Order placed.');
    } catch (err: unknown) {
      setError((err as { detail?: string }).detail || 'Order failed');
    } finally {
      setLoading(false);
    }
  };

  const title = sector === 'bar' ? 'Bar POS' : 'Restaurant POS';

  return (
    <RoleGuard permission="create_pos_order" fallback={<p className="text-slate-500">No access.</p>}>
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-8">{title}</h1>
        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="card">
            <h2 className="font-semibold text-slate-800 mb-4">Menu (fixed prices)</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addToCart(item.id)}
                  className="p-4 border border-slate-200 rounded-lg text-left hover:bg-slate-50"
                >
                  <p className="font-medium text-slate-800">{item.name}</p>
                  <p className="text-sm text-slate-600">{Number(item.price).toLocaleString()} TZS</p>
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <h2 className="font-semibold text-slate-800 mb-4">Order</h2>
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2">
                <input type="radio" checked={paymentIntent === PAY_NOW} onChange={() => setPaymentIntent(PAY_NOW)} />
                Pay Now → receipt
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={paymentIntent === POST_ROOM} onChange={() => setPaymentIntent(POST_ROOM)} />
                Post to Room (folio)
              </label>
            </div>
            {paymentIntent === POST_ROOM && (
              <div className="mb-4">
                <input
                  type="number"
                  placeholder="Folio ID"
                  value={folioId}
                  onChange={(e) => setFolioId(e.target.value)}
                  className="input"
                />
              </div>
            )}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Table / Room"
                value={tableOrRoom}
                onChange={(e) => setTableOrRoom(e.target.value)}
                className="input"
              />
            </div>
            <ul className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {cart.map((c) => {
                const item = items.find((i) => i.id === c.menu_item_id);
                if (!item) return null;
                return (
                  <li key={item.id} className="flex justify-between items-center">
                    <span>{item.name} × {c.quantity}</span>
                    <div className="flex items-center gap-2">
                      <span>{Number(item.price) * c.quantity} TZS</span>
                      <button type="button" onClick={() => removeFromCart(item.id)} className="text-red-600 text-sm">Remove</button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="font-semibold text-slate-800 mb-4">Total: {total.toLocaleString()} TZS</p>
            <button type="button" onClick={submitOrder} disabled={loading || cart.length === 0} className="btn-primary w-full">
              {loading ? 'Placing…' : 'Place order'}
            </button>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
