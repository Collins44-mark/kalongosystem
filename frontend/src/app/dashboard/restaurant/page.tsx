'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { isManagerLevel } from '@/lib/roles';
import { useSearch } from '@/store/search';

type RestaurantItem = { id: string; name: string; price: string; category?: string | null; isEnabled?: boolean };
type OrderRow = {
  id: string;
  createdAt: string;
  paymentMethod: string;
  servedBy: string | null;
  items: { id: string; name: string; quantity: number }[];
};
type StaffWorker = { id: string; role: string; fullName: string; status?: string };

export default function RestaurantPage() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const isAdmin = isManagerLevel(user?.role);
  const searchQuery = useSearch((s) => s.query);
  const [items, setItems] = useState<RestaurantItem[]>([]);
  const [cart, setCart] = useState<{ itemId: string; name: string; price: number; qty: number }[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK' | 'MPESA' | 'TIGOPESA' | 'AIRTEL_MONEY'>('CASH');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [autoTick, setAutoTick] = useState(0);

  const [history, setHistory] = useState<OrderRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState<'today' | 'week' | 'month' | 'bydate'>('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterWorkerId, setFilterWorkerId] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [workers, setWorkers] = useState<StaffWorker[]>([]);
  const q = (searchQuery || '').trim().toLowerCase();

  // Refresh when user returns to tab or when data is updated (e.g. order created).
  useEffect(() => {
    if (!token) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') setAutoTick((x) => x + 1);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'hms-data-updated') setAutoTick((x) => x + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', onStorage);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api<RestaurantItem[]>('/restaurant/items', { token })
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [token, autoTick]);

  function loadHistory() {
    if (!token) return;
    setHistoryLoading(true);
    const params = new URLSearchParams();
    params.set('period', historyPeriod);
    if (historyPeriod === 'bydate' && dateFrom && dateTo) {
      params.set('from', dateFrom);
      params.set('to', dateTo);
    }
    if (isAdmin && filterWorkerId) params.set('workerId', filterWorkerId);
    if (isAdmin && filterPayment) params.set('paymentMethod', filterPayment);
    api<OrderRow[]>(`/restaurant/orders/history?${params}`, { token })
      .then((res) => setHistory(res || []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, historyPeriod, dateFrom, dateTo, filterWorkerId, filterPayment, autoTick]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    api<StaffWorker[]>(`/api/staff-workers?role=RESTAURANT`, { token })
      .then(setWorkers)
      .catch(() => setWorkers([]));
  }, [token, isAdmin]);

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
      if (typeof window !== 'undefined') try { localStorage.setItem('hms-data-updated', Date.now().toString()); } catch { /* ignore */ }
      setMessage(t('restaurant.orderConfirmed'));
      setCart([]);
      loadHistory();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div>{t('common.loading')}</div>;

  const displayedItems = !q
    ? items
    : items.filter((it) => {
        const txt = `${it.name ?? ''} ${it.category ?? ''}`.toLowerCase();
        return txt.includes(q);
      });

  const displayedHistory = !q
    ? history
    : history.filter((o) => {
        const itemsTxt = (o.items || []).map((it) => `${it.name} x${it.quantity}`).join(', ');
        const txt = `${o.paymentMethod} ${o.servedBy ?? ''} ${itemsTxt}`.toLowerCase();
        return txt.includes(q);
      });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">{t('restaurant.title')}</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="font-medium mb-2">{t('restaurant.items')}</h2>
          {isAdmin ? (
            <div className="overflow-x-auto bg-white border rounded">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-3">{t('restaurant.foodName')}</th>
                    <th className="text-left p-3">{t('restaurant.category')}</th>
                    <th className="text-right p-3">{t('restaurant.price')}</th>
                    <th className="text-left p-3">{t('restaurant.status')}</th>
                    <th className="text-left p-3 w-20">{t('common.add')}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedItems.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="p-3 font-medium">{it.name}</td>
                      <td className="p-3">{it.category || '-'}</td>
                      <td className="p-3 text-right">{formatTzs(parseFloat(it.price))}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-1 rounded ${it.isEnabled === false ? 'bg-slate-200 text-slate-700' : 'bg-green-100 text-green-800'}`}>
                          {it.isEnabled === false ? t('restaurant.disabled') : t('restaurant.enabled')}
                        </span>
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => addToCart(it)}
                          disabled={it.isEnabled === false}
                          className="text-teal-600 hover:underline text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t('common.add')}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {displayedItems.length === 0 && (
                    <tr><td className="p-3 text-slate-500" colSpan={5}>{t('common.noItems')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto bg-white border rounded">
              <table className="w-full text-sm min-w-[280px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-3">{t('restaurant.foodName')}</th>
                    <th className="text-right p-3">{t('restaurant.price')}</th>
                    <th className="p-3 w-20">{t('common.add')}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedItems.map((it) => (
                    <tr
                      key={it.id}
                      className={`border-t ${it.isEnabled === false ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50'}`}
                      onClick={() => it.isEnabled !== false && addToCart(it)}
                    >
                      <td className="p-3 font-medium">{it.name}</td>
                      <td className="p-3 text-right text-slate-600">{formatTzs(parseFloat(it.price))}</td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); addToCart(it); }}
                          disabled={it.isEnabled === false}
                          className="text-teal-600 hover:underline text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t('common.add')}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {displayedItems.length === 0 && (
                    <tr><td className="p-3 text-slate-500" colSpan={3}>{t('common.noItems')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div>
          <h2 className="font-medium mb-2">{t('restaurant.order')}</h2>
          <div className="bg-white border rounded p-4 space-y-2">
            {cart.map((c) => (
              <div key={c.itemId} className="flex justify-between items-center">
                <div className="min-w-0">
                  <div className="truncate">{c.name}</div>
                  <div className="text-xs text-slate-500">{formatTzs(c.price)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={c.qty}
                    onChange={(e) => {
                      const v = Math.max(1, Number(e.target.value || 1));
                      setCart((prev) => prev.map((x) => (x.itemId === c.itemId ? { ...x, qty: v } : x)));
                    }}
                    className="w-20 px-2 py-1 border rounded text-sm"
                  />
                <button onClick={() => removeFromCart(c.itemId)} className="text-red-600 text-sm">{t('common.remove')}</button>
                </div>
              </div>
            ))}
            {cart.length === 0 && <p className="text-slate-500 text-sm">{t('common.noItems')}</p>}
          </div>
          {cart.length > 0 && (
            <>
              <div className="mt-4">
                <label className="block text-sm mb-1">{t('restaurant.payment')}</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="CASH">{t('restaurant.payCash')}</option>
                  <option value="BANK">{t('restaurant.payBank')}</option>
                  <optgroup label={t('restaurant.mobileMoney')}>
                    <option value="MPESA">{t('restaurant.payMpesa')}</option>
                    <option value="TIGOPESA">{t('restaurant.payTigo')}</option>
                    <option value="AIRTEL_MONEY">{t('restaurant.payAirtel')}</option>
                  </optgroup>
                </select>
              </div>
              <button
                onClick={confirmOrder}
                disabled={submitting}
                className="mt-4 w-full py-2 bg-teal-600 text-white rounded"
              >
                {t('restaurant.confirmOrder')}
              </button>
            </>
          )}
          {message && <p className="mt-2 text-sm text-green-600">{message}</p>}

          {isAdmin && <MenuManagement token={token ?? ''} items={items} onChanged={() => setAutoTick((x) => x + 1)} />}
        </div>
      </div>

      <div className="mt-8 bg-white border rounded p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-medium">{t('restaurant.orderHistory')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select value={historyPeriod} onChange={(e) => setHistoryPeriod(e.target.value as any)} className="px-2 py-1 border rounded text-xs sm:text-sm">
              <option value="today">{t('overview.today')}</option>
              <option value="week">{t('overview.thisWeek')}</option>
              <option value="month">{t('overview.thisMonth')}</option>
              <option value="bydate">{t('overview.byDate')}</option>
            </select>
            {historyPeriod === 'bydate' && (
              <div className="flex items-center gap-2">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-2 py-1 border rounded text-xs sm:text-sm" />
                <span className="text-slate-400 text-xs sm:text-sm">{t('common.to')}</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-2 py-1 border rounded text-xs sm:text-sm" />
              </div>
            )}
            {isAdmin && (
              <>
                <select value={filterWorkerId} onChange={(e) => setFilterWorkerId(e.target.value)} className="px-2 py-1 border rounded text-xs sm:text-sm">
                  <option value="">{t('restaurant.allWorkers')}</option>
                  {workers.filter((w) => w.status !== 'BLOCKED').map((w) => (
                    <option key={w.id} value={w.id}>{w.fullName}</option>
                  ))}
                </select>
                <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)} className="px-2 py-1 border rounded text-xs sm:text-sm">
                  <option value="">{t('restaurant.allPayments')}</option>
                  <option value="CASH">{t('restaurant.payCash')}</option>
                  <option value="BANK">{t('restaurant.payBank')}</option>
                  <option value="MPESA">{t('restaurant.payMpesa')}</option>
                  <option value="TIGOPESA">{t('restaurant.payTigo')}</option>
                  <option value="AIRTEL_MONEY">{t('restaurant.payAirtel')}</option>
                </select>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-3">{t('common.date')}</th>
                <th className="text-left p-3">{t('restaurant.itemsSummary')}</th>
                <th className="text-right p-3">{t('restaurant.quantity')}</th>
                <th className="text-left p-3">{t('restaurant.payment')}</th>
                <th className="text-left p-3">{t('restaurant.servedBy')}</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading ? (
                <tr>
                  <td className="p-3 text-slate-500" colSpan={5}>{t('common.loading')}</td>
                </tr>
              ) : displayedHistory.length === 0 ? (
                <tr>
                  <td className="p-3 text-slate-500" colSpan={5}>{t('common.noItems')}</td>
                </tr>
              ) : (
                displayedHistory.map((o) => (
                  <tr key={o.id} className="border-t align-top">
                    <td className="p-3 whitespace-nowrap">{new Date(o.createdAt).toLocaleString()}</td>
                    <td className="p-3 text-slate-700">
                      {o.items.map((it) => `${it.name} x${it.quantity}`).join(', ')}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">{o.items.reduce((s, it) => s + (it.quantity || 0), 0)}</td>
                    <td className="p-3 whitespace-nowrap">{formatPayment(o.paymentMethod, t)}</td>
                    <td className="p-3 whitespace-nowrap">{o.servedBy || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

function formatPayment(p: string, t: (k: string) => string) {
  if (p === 'CASH') return t('restaurant.payCash');
  if (p === 'BANK') return t('restaurant.payBank');
  if (p === 'MPESA') return t('restaurant.payMpesa');
  if (p === 'TIGOPESA') return t('restaurant.payTigo');
  if (p === 'AIRTEL_MONEY') return t('restaurant.payAirtel');
  return p;
}

function MenuManagement({ token, items, onChanged }: { token: string; items: RestaurantItem[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [editing, setEditing] = useState<RestaurantItem | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editEnabled, setEditEnabled] = useState(true);

  async function addItem() {
    if (!token) return;
    if (!name.trim()) return;
    const p = Number(price);
    if (!isFinite(p) || p < 0) return;
    setAdding(true);
    try {
      await api('/restaurant/items', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: name.trim(), price: p, category: category.trim() || null, isEnabled: true }),
      });
      setShowAdd(false);
      setName('');
      setCategory('');
      setPrice('');
      onChanged();
    } finally {
      setAdding(false);
    }
  }

  function startEdit(it: RestaurantItem) {
    setEditing(it);
    setEditName(it.name);
    setEditCategory(it.category || '');
    setEditPrice(it.price);
    setEditEnabled(it.isEnabled !== false);
  }

  async function saveEdit() {
    if (!token || !editing) return;
    const p = Number(editPrice);
    if (!editName.trim() || !isFinite(p) || p < 0) return;
    setSavingEdit(true);
    try {
      await api(`/restaurant/items/${editing.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          name: editName.trim(),
          price: p,
          category: editCategory.trim() || null,
          isEnabled: editEnabled,
        }),
      });
      setEditing(null);
      onChanged();
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium">{t('restaurant.menuManagement')}</h3>
        <button type="button" onClick={() => setShowAdd(true)} className="px-3 py-1.5 bg-teal-600 text-white rounded text-sm">
          {t('restaurant.addFoodItem')}
        </button>
      </div>

      <div className="overflow-x-auto bg-white border rounded">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3">{t('restaurant.foodName')}</th>
              <th className="text-left p-3">{t('restaurant.category')}</th>
              <th className="text-left p-3">{t('restaurant.price')}</th>
              <th className="text-left p-3">{t('restaurant.status')}</th>
              <th className="text-left p-3 w-24">{t('common.edit')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="p-3 font-medium">{it.name}</td>
                <td className="p-3">{it.category || '-'}</td>
                <td className="p-3">{formatTzs(parseFloat(it.price))}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-1 rounded ${it.isEnabled === false ? 'bg-slate-200 text-slate-700' : 'bg-green-100 text-green-800'}`}>
                    {it.isEnabled === false ? t('restaurant.disabled') : t('restaurant.enabled')}
                  </span>
                </td>
                <td className="p-3">
                  <button type="button" onClick={() => startEdit(it)} className="text-teal-700 hover:underline text-sm">
                    {t('common.edit')}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td className="p-3 text-slate-500" colSpan={5}>{t('common.noItems')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded max-w-sm w-full p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">{t('restaurant.addFoodItem')}</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-500">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">{t('restaurant.foodName')}</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('restaurant.category')}</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('restaurant.price')}</label>
                <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={addItem} disabled={adding} className="px-4 py-2 bg-teal-600 text-white rounded w-full disabled:opacity-50">
                {adding ? '...' : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded max-w-sm w-full p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">{t('restaurant.editItem')}</h3>
              <button onClick={() => setEditing(null)} className="text-slate-500">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">{t('restaurant.foodName')}</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('restaurant.category')}</label>
                <input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('restaurant.price')}</label>
                <input type="number" min="0" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editEnabled} onChange={(e) => setEditEnabled(e.target.checked)} />
                <span>{t('restaurant.enabled')}</span>
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveEdit} disabled={savingEdit} className="px-4 py-2 bg-teal-600 text-white rounded w-full disabled:opacity-50">
                {savingEdit ? '...' : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
