'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { isManagerLevel } from '@/lib/roles';

type BarItem = { id: string; name: string; price: string; stock: number | null; minQuantity: number | null };
type RestockPermission = { enabled: boolean; expiresAt?: string | null; approvedByWorkerName?: string | null };
type Restock = {
  id: string;
  createdAt: string;
  createdByRole: string;
  createdByWorkerName?: string | null;
  approvedByRole: string;
  approvedByWorkerName?: string | null;
  items: { id: string; barItemId: string; stockBefore: number; quantityAdded: number; stockAfter: number; barItem: { name: string } }[];
};

export default function BarPage() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const [items, setItems] = useState<BarItem[]>([]);
  const [cart, setCart] = useState<{ itemId: string; name: string; price: number; qty: number }[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_MONEY' | 'BANK'>('CASH');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [perm, setPerm] = useState<RestockPermission>({ enabled: false });
  const [showRestock, setShowRestock] = useState(false);
  const [restockQty, setRestockQty] = useState<Record<string, string>>({});
  const [savingRestock, setSavingRestock] = useState(false);
  const [restocks, setRestocks] = useState<Restock[]>([]);
  const [selectedRestock, setSelectedRestock] = useState<Restock | null>(null);
  const [filter, setFilter] = useState<'all' | 'low' | 'normal' | 'out'>('all');
  const [permSaving, setPermSaving] = useState(false);
  const [permMinutes, setPermMinutes] = useState<string>(''); // '' = manual until turned off
  const isAdmin = isManagerLevel(user?.role);

  useEffect(() => {
    if (!token) return;
    api<BarItem[]>('/bar/items', { token })
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api<RestockPermission>('/bar/restock-permission', { token })
      .then(setPerm)
      .catch(() => setPerm({ enabled: false }));
  }, [token]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    api<Restock[]>('/bar/restocks', { token })
      .then(setRestocks)
      .catch(() => setRestocks([]));
  }, [token, isAdmin]);

  async function togglePermission(next: boolean) {
    if (!token) return;
    setPermSaving(true);
    try {
      const expiresMinutes = permMinutes ? Number(permMinutes) : null;
      const res = await api<RestockPermission>('/bar/restock-permission', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ enabled: next, expiresMinutes }),
      });
      setPerm(res);
      setMessage(next ? t('bar.permissionEnabled') : t('bar.permissionDisabled'));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setPermSaving(false);
    }
  }

  function addToCart(item: BarItem) {
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
    if (cart.length === 0 || !token) return;
    setSubmitting(true);
    setMessage('');
    try {
      await api('/bar/orders', {
        method: 'POST',
        token: token ?? undefined,
        body: JSON.stringify({
          items: cart.map((c) => ({ barItemId: c.itemId, quantity: c.qty })),
          paymentMethod,
        }),
      });
      setMessage(t('bar.orderConfirmed'));
      setCart([]);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div>{t('common.loading')}</div>;

  const totalItems = items.length;
  const outOfStock = items.filter((i) => (i.stock ?? 0) <= 0).length;
  const lowStock = items.filter((i) => (i.stock ?? 0) > 0 && i.minQuantity != null && (i.stock ?? 0) <= i.minQuantity).length;

  const filteredItems = items.filter((i) => {
    const stock = i.stock ?? 0;
    const min = i.minQuantity ?? 0;
    if (filter === 'out') return stock <= 0;
    if (filter === 'low') return stock > 0 && i.minQuantity != null && stock <= min;
    if (filter === 'normal') return i.minQuantity != null ? stock > min : stock > 0;
    return true;
  });

  const restocksByDay = restocks.reduce<Record<string, Restock[]>>((acc, r) => {
    const day = new Date(r.createdAt).toISOString().slice(0, 10);
    acc[day] = acc[day] || [];
    acc[day].push(r);
    return acc;
  }, {});
  const restockDays = Object.keys(restocksByDay).sort((a, b) => (a < b ? 1 : -1));

  async function saveRestock() {
    if (!token) return;
    const payload = Object.entries(restockQty)
      .map(([barItemId, v]) => ({ barItemId, quantityAdded: Number(v) }))
      .filter((x) => x.quantityAdded && x.quantityAdded > 0);
    if (payload.length === 0) {
      setMessage(t('bar.enterRestockQty'));
      return;
    }
    setSavingRestock(true);
    setMessage('');
    try {
      await api('/bar/restocks', {
        method: 'POST',
        token,
        body: JSON.stringify({ items: payload }),
      });
      setShowRestock(false);
      setRestockQty({});
      setMessage(t('bar.restockSaved'));
      const refreshed = await api<BarItem[]>('/bar/items', { token });
      setItems(refreshed);
      if (isAdmin) {
        const rs = await api<Restock[]>('/bar/restocks', { token });
        setRestocks(rs);
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSavingRestock(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">{t('bar.title')}</h1>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        {user?.role === 'BAR' && (
          <p className="text-sm text-slate-500">{t('bar.selectItemsDesc')}</p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!perm.enabled && !isAdmin}
            onClick={() => setShowRestock(true)}
            className={`px-3 py-2 rounded text-sm border ${
              perm.enabled || isAdmin ? 'bg-white hover:border-teal-500' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
            title={perm.enabled || isAdmin ? t('bar.createRestock') : t('bar.waitingForPermission')}
          >
            {t('bar.createRestock')}
          </button>
          {!perm.enabled && !isAdmin && (
            <span className="text-xs text-slate-500">{t('bar.waitingForPermission')}</span>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-white border rounded p-4">
            <div className="text-xs text-slate-500">{t('bar.totalItems')}</div>
            <div className="text-xl font-semibold">{totalItems}</div>
          </div>
          <div className="bg-white border rounded p-4">
            <div className="text-xs text-slate-500">{t('bar.lowStock')}</div>
            <div className="text-xl font-semibold text-amber-700">{lowStock}</div>
          </div>
          <div className="bg-white border rounded p-4">
            <div className="text-xs text-slate-500">{t('bar.outOfStock')}</div>
            <div className="text-xl font-semibold text-red-700">{outOfStock}</div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="bg-white border rounded p-4 mb-6 max-w-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">{t('bar.restockPermission')}</div>
              <div className="text-xs text-slate-500">
                {perm.enabled ? t('bar.permissionOn') : t('bar.permissionOff')}
                {perm.expiresAt ? ` · ${t('bar.expires')} ${new Date(perm.expiresAt).toLocaleString()}` : ''}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={perm.enabled}
                disabled={permSaving}
                onChange={(e) => togglePermission(e.target.checked)}
              />
              <span>{t('common.confirm')}</span>
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs text-slate-600">{t('bar.permissionDuration')}</label>
            <select
              value={permMinutes}
              onChange={(e) => setPermMinutes(e.target.value)}
              className="px-2 py-1 border rounded text-xs"
              disabled={permSaving}
            >
              <option value="">{t('bar.untilOff')}</option>
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="60">60 min</option>
            </select>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap gap-2 mb-4">
          {(['all', 'low', 'normal', 'out'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-sm ${filter === f ? 'bg-teal-600 text-white' : 'bg-slate-200'}`}
            >
              {f === 'all' ? t('bar.filterAll') : f === 'low' ? t('bar.filterLow') : f === 'out' ? t('bar.filterOut') : t('bar.filterNormal')}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="font-medium mb-2">{t('bar.items')}</h2>
          <div className="grid grid-cols-2 gap-2">
            {filteredItems.map((item) => {
              const stock = item.stock ?? 0;
              const min = item.minQuantity ?? null;
              const isOut = item.stock != null && stock <= 0;
              const isLow = item.stock != null && min != null && stock > 0 && stock <= min;
              return (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                className="p-4 bg-white border rounded text-left hover:border-teal-500"
              >
                <div className="font-medium">{item.name}</div>
                <div className="text-sm text-slate-600">{formatTzs(parseFloat(item.price))}</div>
                {item.stock != null && (
                  <div className={`text-xs mt-1 ${isOut ? 'text-red-700' : isLow ? 'text-amber-700' : 'text-slate-500'}`}>
                    {t('bar.stock')}: {stock}{min != null ? ` (min ${min})` : ''}
                  </div>
                )}
              </button>
            )})}
          </div>
        </div>
        <div>
          <h2 className="font-medium mb-2">{t('bar.order')}</h2>
          <div className="bg-white border rounded p-4 space-y-2">
            {cart.map((c) => (
              <div key={c.itemId} className="flex justify-between items-center">
                <span>{c.name} x{c.qty}</span>
                <button onClick={() => removeFromCart(c.itemId)} className="text-red-600 text-sm">{t('common.remove')}</button>
              </div>
            ))}
            {cart.length === 0 && <p className="text-slate-500 text-sm">{t('common.noItems')}</p>}
          </div>
          {cart.length > 0 && (
            <>
              <div className="mt-4">
                <label className="block text-sm mb-1">{t('bar.payment')}</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="CASH">{t('bar.cash')}</option>
                  <option value="MOBILE_MONEY">{t('bar.mobileMoney')}</option>
                  <option value="BANK">{t('bar.bank')}</option>
                </select>
              </div>
              <button
                onClick={confirmOrder}
                disabled={submitting}
                className="mt-4 w-full py-2 bg-teal-600 text-white rounded"
              >
                {t('bar.confirmOrder')}
              </button>
            </>
          )}
          {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
        </div>
      </div>

      {isAdmin && (
        <div className="mt-8 bg-white border rounded p-4">
          <h2 className="font-medium mb-3">{t('bar.restockHistory')}</h2>
          {restocks.length === 0 ? (
            <p className="text-sm text-slate-500">{t('bar.noRestocks')}</p>
          ) : (
            <div className="space-y-4">
              {restockDays.map((day) => (
                <div key={day}>
                  <div className="text-xs font-medium text-slate-500 mb-2">{day}</div>
                  <div className="space-y-2">
                    {restocksByDay[day].map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setSelectedRestock(r)}
                        className="w-full text-left p-3 border rounded hover:border-teal-500"
                      >
                        <div className="text-sm font-medium">
                          {new Date(r.createdAt).toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-600">
                          {t('bar.restockedBy')}: {r.createdByRole}{r.createdByWorkerName ? ` / ${r.createdByWorkerName}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showRestock && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded max-w-2xl w-full max-h-[80vh] overflow-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">{t('bar.createRestock')}</h3>
              <button onClick={() => setShowRestock(false)} className="text-slate-500">✕</button>
            </div>
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-2 border-b py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{it.name}</div>
                    <div className="text-xs text-slate-500">
                      {t('bar.stock')}: {it.stock == null ? t('bar.noStockTracking') : it.stock}
                    </div>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={restockQty[it.id] ?? ''}
                    onChange={(e) => setRestockQty((p) => ({ ...p, [it.id]: e.target.value }))}
                    className="w-24 px-2 py-1 border rounded text-sm"
                    placeholder="0"
                    disabled={it.stock == null}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveRestock} disabled={savingRestock} className="px-4 py-2 bg-teal-600 text-white rounded">
                {savingRestock ? '...' : t('common.save')}
              </button>
              <button onClick={() => setShowRestock(false)} className="px-4 py-2 bg-slate-200 rounded">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRestock && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded max-w-2xl w-full max-h-[80vh] overflow-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">{t('bar.restockDetails')}</h3>
              <button onClick={() => setSelectedRestock(null)} className="text-slate-500">✕</button>
            </div>
            <div className="text-sm text-slate-600 mb-3">
              {new Date(selectedRestock.createdAt).toLocaleString()} · {t('bar.restockedBy')}: {selectedRestock.createdByRole}{selectedRestock.createdByWorkerName ? ` / ${selectedRestock.createdByWorkerName}` : ''}
            </div>
            <div className="space-y-2">
              {selectedRestock.items.map((it) => (
                <div key={it.id} className="grid grid-cols-4 gap-2 text-sm border-b py-2">
                  <div className="col-span-2 font-medium">{it.barItem.name}</div>
                  <div className="text-slate-600">{it.stockBefore} → {it.stockAfter}</div>
                  <div className="text-right text-teal-700">+{it.quantityAdded}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setSelectedRestock(null)} className="mt-4 px-4 py-2 bg-slate-200 rounded">
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}
