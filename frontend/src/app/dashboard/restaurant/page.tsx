'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

type RestaurantItem = { id: string; name: string; price: string };

export default function RestaurantPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<RestaurantItem[]>([]);
  const [cart, setCart] = useState<{ itemId: string; name: string; price: number; qty: number }[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_MONEY' | 'BANK'>('CASH');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    api<RestaurantItem[]>('/restaurant/items', { token })
      .then(setItems)
      .finally(() => setLoading(false));
  }, [token]);

  function addToCart(item: RestaurantItem) {
    const existing = cart.find((c) => c.itemId === item.id);
    const price = parseFloat(item.price);
    if (existing) {
      setCart(cart.map((c) => (c.itemId === item.id ? { ...c, qty: c.qty + 1 } : c)));
    } else {
      setCart([...cart, { itemId: item.id, name: item.name, price, qty: 1 }]);
    }
  }

  function removeFromCart(itemId: string) {
    setCart(cart.filter((c) => c.itemId !== itemId));
  }

  async function confirmOrder() {
    if (cart.length === 0) return;
    setSubmitting(true);
    setMessage('');
    try {
      await api('/restaurant/orders', {
        method: 'POST',
        token,
        body: JSON.stringify({
          items: cart.map((c) => ({ restaurantItemId: c.itemId, quantity: c.qty })),
          paymentMethod,
        }),
      });
      setMessage('Order confirmed');
      setCart([]);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Restaurant</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="font-medium mb-2">Items</h2>
          <div className="grid grid-cols-2 gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                className="p-4 bg-white border rounded text-left hover:border-teal-500"
              >
                <div className="font-medium">{item.name}</div>
                <div className="text-sm text-slate-600">{formatTzs(parseFloat(item.price))}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h2 className="font-medium mb-2">Order</h2>
          <div className="bg-white border rounded p-4 space-y-2">
            {cart.map((c) => (
              <div key={c.itemId} className="flex justify-between items-center">
                <span>{c.name} x{c.qty}</span>
                <button onClick={() => removeFromCart(c.itemId)} className="text-red-600 text-sm">Remove</button>
              </div>
            ))}
            {cart.length === 0 && <p className="text-slate-500 text-sm">No items</p>}
          </div>
          {cart.length > 0 && (
            <>
              <div className="mt-4">
                <label className="block text-sm mb-1">Payment</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="CASH">Cash</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                  <option value="BANK">Bank</option>
                </select>
              </div>
              <button
                onClick={confirmOrder}
                disabled={submitting}
                className="mt-4 w-full py-2 bg-teal-600 text-white rounded"
              >
                Confirm Order
              </button>
            </>
          )}
          {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
        </div>
      </div>
    </div>
  );
}

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}
