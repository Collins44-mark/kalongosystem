'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { isManagerLevel } from '@/lib/roles';
import { useSearchParams } from 'next/navigation';
import { useSearch } from '@/store/search';

type BarItem = { id: string; name: string; price: string; stock: number | null; minQuantity: number | null };
type RestockPermission = { enabled: boolean; expiresAt?: string | null; approvedByWorkerName?: string | null };
type AddItemPermission = { enabled: boolean; expiresAt?: string | null; approvedByWorkerName?: string | null };
type Restock = {
  id: string;
  createdAt: string;
  createdByRole: string;
  createdByWorkerName?: string | null;
  approvedByRole: string;
  approvedByWorkerName?: string | null;
  items: { id: string; barItemId: string; stockBefore: number; quantityAdded: number; stockAfter: number; barItem: { name: string } }[];
};

type AdminOrder = {
  id: string;
  orderNumber: string;
  paymentMethod: string;
  totalAmount: string;
  createdAt: string;
  createdByWorkerName?: string | null;
  items: { id: string; quantity: number; barItem: { name: string } }[];
};

export default function BarPage() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const searchQuery = useSearch((s) => s.query);
  const [items, setItems] = useState<BarItem[]>([]);
  const [cart, setCart] = useState<{ itemId: string; name: string; price: number; qty: number }[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_MONEY' | 'BANK'>('CASH');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [perm, setPerm] = useState<RestockPermission>({ enabled: false });
  const [addPerm, setAddPerm] = useState<AddItemPermission>({ enabled: false });
  const [showRestock, setShowRestock] = useState(false);
  const [restockQty, setRestockQty] = useState<Record<string, string>>({});
  const [savingRestock, setSavingRestock] = useState(false);
  const [restocks, setRestocks] = useState<Restock[]>([]);
  const [selectedRestock, setSelectedRestock] = useState<Restock | null>(null);
  const [filter, setFilter] = useState<'all' | 'low' | 'normal' | 'out'>('all');
  const [permSaving, setPermSaving] = useState(false);
  const [permMinutes, setPermMinutes] = useState<string>(''); // '' = manual until turned off
  const [addPermSaving, setAddPermSaving] = useState(false);
  const [addPermMinutes, setAddPermMinutes] = useState<string>(''); // '' = manual until turned off
  const isAdmin = isManagerLevel(user?.role);
  // Allow deep-linking from Overview, e.g. /dashboard/bar?filter=low
  useEffect(() => {
    const f = (searchParams?.get('filter') || '').toLowerCase();
    if (f === 'low' || f === 'out' || f === 'normal' || f === 'all') {
      setFilter(f as typeof filter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemQty, setNewItemQty] = useState('');
  const [newItemMin, setNewItemMin] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [adminOrders, setAdminOrders] = useState<AdminOrder[]>([]);
  const [adminOrdersLoading, setAdminOrdersLoading] = useState(false);
  const [ordersPeriod, setOrdersPeriod] = useState<'today' | 'week' | 'month' | 'bydate'>('today');
  const [ordersFrom, setOrdersFrom] = useState('');
  const [ordersTo, setOrdersTo] = useState('');
  const [autoTick, setAutoTick] = useState(0);

  // Auto-refresh (every 15s) while tab is visible
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') setAutoTick((t) => t + 1);
    }, 15000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api<BarItem[]>('/bar/items', { token })
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [token, autoTick]);

  useEffect(() => {
    if (!token) return;
    api<RestockPermission>('/bar/restock-permission', { token })
      .then(setPerm)
      .catch(() => setPerm({ enabled: false }));
  }, [token, autoTick]);

  useEffect(() => {
    if (!token) return;
    api<AddItemPermission>('/bar/add-item-permission', { token })
      .then(setAddPerm)
      .catch(() => setAddPerm({ enabled: false }));
  }, [token, autoTick]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    api<Restock[]>('/bar/restocks', { token })
      .then(setRestocks)
      .catch(() => setRestocks([]));
  }, [token, isAdmin, autoTick]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    setAdminOrdersLoading(true);
    const params = new URLSearchParams();
    params.set('period', ordersPeriod);
    if (ordersPeriod === 'bydate' && ordersFrom && ordersTo) {
      params.set('from', ordersFrom);
      params.set('to', ordersTo);
    }
    api<AdminOrder[]>(`/bar/orders?${params}`, { token })
      .then(setAdminOrders)
      .catch(() => setAdminOrders([]))
      .finally(() => setAdminOrdersLoading(false));
  }, [token, isAdmin, ordersPeriod, ordersFrom, ordersTo, autoTick]);

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

  async function toggleAddItemPermission(next: boolean) {
    if (!token) return;
    setAddPermSaving(true);
    try {
      const expiresMinutes = addPermMinutes ? Number(addPermMinutes) : null;
      const res = await api<AddItemPermission>('/bar/add-item-permission', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ enabled: next, expiresMinutes }),
      });
      setAddPerm(res);
      setMessage(next ? t('bar.addItemPermissionEnabled') : t('bar.addItemPermissionDisabled'));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setAddPermSaving(false);
    }
  }

  function addToCart(item: BarItem) {
    const stock = item.stock ?? 0;
    if (stock <= 0) {
      setMessage(t('bar.outOfStockCannotOrder'));
      return;
    }
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
      if (typeof window !== 'undefined') try { localStorage.setItem('hms-data-updated', Date.now().toString()); } catch { /* ignore */ }
      setMessage(t('bar.orderConfirmed'));
      setCart([]);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div>{t('common.loading')}</div>;

  const q = (searchQuery || '').trim().toLowerCase();

  const totalItems = items.length;
  // Treat missing stock tracking as 0 so admins can restock/link old items.
  const outOfStock = items.filter((i) => (i.stock ?? 0) <= 0).length;
  const lowStock = items.filter((i) => {
    const stock = i.stock ?? 0;
    const min = i.minQuantity ?? null;
    return stock > 0 && min != null && stock <= min;
  }).length;

  const filteredItems = items
    .filter((i) => {
      if (!q) return true;
      return (i.name || '').toLowerCase().includes(q);
    })
    .filter((i) => {
    const stock = i.stock ?? 0;
    const min = i.minQuantity ?? null;
    if (filter === 'out') return stock <= 0;
    if (filter === 'low') return stock > 0 && min != null && stock <= min;
    if (filter === 'normal') {
      if (min == null) return stock > 0;
      return stock > min;
    }
    return true;
  });

  const adminOrdersFiltered = !q
    ? adminOrders
    : adminOrders.filter((o) => {
        const itemsTxt = (o.items || []).map((it) => `${it.barItem?.name ?? ''} x${it.quantity}`).join(', ');
        const txt = `${o.orderNumber} ${o.paymentMethod} ${o.createdByWorkerName ?? ''} ${itemsTxt}`.toLowerCase();
        return txt.includes(q);
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

  async function saveNewItem() {
    if (!token) return;
    if (!newItemName.trim()) {
      setMessage(t('bar.enterItemName'));
      return;
    }
    const price = Number(newItemPrice);
    const qty = Number(newItemQty);
    const minQ = newItemMin ? Number(newItemMin) : undefined;
    if (!isFinite(price) || price < 0) {
      setMessage(t('bar.invalidPrice'));
      return;
    }
    if (!isFinite(qty) || qty < 0) {
      setMessage(t('bar.invalidQuantity'));
      return;
    }
    setAddingItem(true);
    setMessage('');
    try {
      await api('/bar/items', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: newItemName.trim(), price, quantity: qty, minQuantity: minQ }),
      });
      setShowAddItem(false);
      setNewItemName('');
      setNewItemPrice('');
      setNewItemQty('');
      setNewItemMin('');
      setMessage(t('bar.itemAdded'));
      const refreshed = await api<BarItem[]>('/bar/items', { token });
      setItems(refreshed);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setAddingItem(false);
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
          <button type="button" onClick={() => setFilter('all')} className="bg-white border rounded p-4 text-left hover:border-teal-300">
            <div className="text-xs text-slate-500">{t('bar.totalItems')}</div>
            <div className="text-xl font-semibold">{totalItems}</div>
          </button>
          <button type="button" onClick={() => setFilter('low')} className="bg-white border rounded p-4 text-left hover:border-amber-300">
            <div className="text-xs text-slate-500">{t('bar.lowStock')}</div>
            <div className="text-xl font-semibold text-amber-700">{lowStock}</div>
          </button>
          <button type="button" onClick={() => setFilter('out')} className="bg-white border rounded p-4 text-left hover:border-red-300">
            <div className="text-xs text-slate-500">{t('bar.outOfStock')}</div>
            <div className="text-xl font-semibold text-red-700">{outOfStock}</div>
          </button>
        </div>
      )}

      {isAdmin && (
        <div className="bg-white border rounded p-4 mb-6 max-w-xl">
          <div className="font-medium mb-3">{t('bar.permissions')}</div>

          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{t('bar.restockPermission')}</div>
                <div className="text-xs text-slate-500">
                  {perm.enabled ? t('bar.permissionOn') : t('bar.permissionOff')}
                  {perm.expiresAt ? ` · ${t('bar.expires')} ${new Date(perm.expiresAt).toLocaleString()}` : ''}
                </div>
                <div className="mt-2 flex items-center gap-2">
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
              <label className="flex items-center gap-2 text-sm pt-0.5">
                <input
                  type="checkbox"
                  checked={perm.enabled}
                  disabled={permSaving}
                  onChange={(e) => togglePermission(e.target.checked)}
                />
                <span>{t('common.confirm')}</span>
              </label>
            </div>

            <div className="flex items-start justify-between gap-3 border-t pt-4">
              <div>
                <div className="text-sm font-medium">{t('bar.addItemPermission')}</div>
                <div className="text-xs text-slate-500">
                  {addPerm.enabled ? t('bar.permissionOn') : t('bar.permissionOff')}
                  {addPerm.expiresAt ? ` · ${t('bar.expires')} ${new Date(addPerm.expiresAt).toLocaleString()}` : ''}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-slate-600">{t('bar.permissionDuration')}</label>
                  <select
                    value={addPermMinutes}
                    onChange={(e) => setAddPermMinutes(e.target.value)}
                    className="px-2 py-1 border rounded text-xs"
                    disabled={addPermSaving}
                  >
                    <option value="">{t('bar.untilOff')}</option>
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="60">60 min</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm pt-0.5">
                <input
                  type="checkbox"
                  checked={addPerm.enabled}
                  disabled={addPermSaving}
                  onChange={(e) => toggleAddItemPermission(e.target.checked)}
                />
                <span>{t('common.confirm')}</span>
              </label>
            </div>
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
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium">{t('bar.items')}</h2>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setShowAddItem(true)}
                className="px-3 py-1.5 bg-teal-600 text-white rounded text-sm"
              >
                {t('bar.addItem')}
              </button>
            ) : user?.role === 'BAR' ? (
              <button
                type="button"
                disabled={!addPerm.enabled}
                onClick={() => setShowAddItem(true)}
                className={`px-3 py-1.5 rounded text-sm border ${
                  addPerm.enabled ? 'bg-white hover:border-teal-500' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title={addPerm.enabled ? t('bar.addItem') : t('bar.waitingForPermission')}
              >
                {t('bar.addItem')}
              </button>
            ) : null}
          </div>

          <div className="bg-white border rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-3">{t('bar.itemName')}</th>
                  <th className="text-left p-3">{t('bar.itemPrice')}</th>
                  <th className="text-right p-3">{t('bar.stock')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const stock = item.stock ?? 0;
                  const min = item.minQuantity;
                  const isOut = stock <= 0;
                  const isLow = min != null && stock > 0 && stock <= min;
                  const disabled = isOut;
                  return (
                    <tr
                      key={item.id}
                      id={`bar-item-${item.id}`}
                      className={`border-t ${
                        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'
                      } ${isOut ? 'bg-red-50/40' : isLow ? 'bg-amber-50/40' : ''}`}
                      onClick={() => {
                        if (!disabled) addToCart(item);
                      }}
                      title={t('bar.tapToAdd')}
                    >
                      <td className="p-3 font-medium">
                        <div className="truncate">{item.name}</div>
                        {item.stock == null && <div className="text-xs text-slate-500">{t('bar.noStockTracking')}</div>}
                      </td>
                      <td className="p-3 text-slate-600">{formatTzs(parseFloat(item.price))}</td>
                      <td className={`p-3 text-right ${isOut ? 'text-red-700 font-medium' : isLow ? 'text-amber-700 font-medium' : 'text-slate-700'}`}>
                        {stock}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
            {filteredItems.length === 0 && <div className="p-3 text-sm text-slate-500">{t('common.noItems')}</div>}
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

          {user?.role === 'BAR' && token && <MyOrders token={token} autoTick={autoTick} />}
        </div>
      </div>

      {isAdmin && (
        <div className="mt-8 bg-white border rounded p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="font-medium">{t('bar.orderHistory')}</h2>
            <div className="flex items-center gap-2">
              <select
                value={ordersPeriod}
                onChange={(e) => setOrdersPeriod(e.target.value as any)}
                className="px-2 py-1 border rounded text-xs sm:text-sm"
              >
                <option value="today">{t('overview.today')}</option>
                <option value="week">{t('overview.thisWeek')}</option>
                <option value="month">{t('overview.thisMonth')}</option>
                <option value="bydate">{t('overview.byDate')}</option>
              </select>
              {ordersPeriod === 'bydate' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={ordersFrom}
                    onChange={(e) => setOrdersFrom(e.target.value)}
                    className="px-2 py-1 border rounded text-xs sm:text-sm"
                  />
                  <span className="text-slate-400 text-xs sm:text-sm">{t('common.to')}</span>
                  <input
                    type="date"
                    value={ordersTo}
                    onChange={(e) => setOrdersTo(e.target.value)}
                    className="px-2 py-1 border rounded text-xs sm:text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left p-3">{t('common.date')}</th>
                  <th className="text-left p-3">{t('bar.orderNo')}</th>
                  <th className="text-left p-3">{t('bar.savedBy')}</th>
                  <th className="text-left p-3">{t('bar.items')}</th>
                  <th className="text-left p-3">{t('bar.payment')}</th>
                  <th className="text-right p-3">{t('bar.totalAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {adminOrdersLoading ? (
                  <tr>
                    <td className="p-3 text-slate-500" colSpan={6}>
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : adminOrdersFiltered.length === 0 ? (
                  <tr>
                    <td className="p-3 text-slate-500" colSpan={6}>
                      {t('common.noItems')}
                    </td>
                  </tr>
                ) : (
                  adminOrdersFiltered.map((o) => (
                    <tr key={o.id} className="border-t align-top">
                      <td className="p-3 whitespace-nowrap">{new Date(o.createdAt).toLocaleString()}</td>
                      <td className="p-3 font-medium whitespace-nowrap">{o.orderNumber}</td>
                      <td className="p-3 whitespace-nowrap">{o.createdByWorkerName || '-'}</td>
                      <td className="p-3">
                        <div className="text-slate-700">
                          {(o.items || [])
                            .map((it) => `${it.barItem?.name ?? ''} x${it.quantity}`)
                            .filter(Boolean)
                            .join(', ') || '-'}
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">{o.paymentMethod}</td>
                      <td className="p-3 text-right whitespace-nowrap">{formatTzs(parseFloat(o.totalAmount as any))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                      {t('bar.stock')}: {it.stock == null ? 0 : it.stock}
                      {it.stock == null ? ` · ${t('bar.noStockTracking')}` : ''}
                    </div>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={restockQty[it.id] ?? ''}
                    onChange={(e) => setRestockQty((p) => ({ ...p, [it.id]: e.target.value }))}
                    className="w-24 px-2 py-1 border rounded text-sm"
                    placeholder="0"
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
            <div className="bg-white border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-3">{t('bar.itemName')}</th>
                    <th className="text-right p-3">{t('bar.before')}</th>
                    <th className="text-right p-3">{t('bar.added')}</th>
                    <th className="text-right p-3">{t('bar.after')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRestock.items.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="p-3 font-medium">{it.barItem.name}</td>
                      <td className="p-3 text-right text-slate-700">{it.stockBefore}</td>
                      <td className="p-3 text-right text-teal-700">+{it.quantityAdded}</td>
                      <td className="p-3 text-right text-slate-900">{it.stockAfter}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-slate-50">
                    <td className="p-3 font-semibold">{t('bar.total')}</td>
                    <td className="p-3" />
                    <td className="p-3 text-right font-semibold text-teal-700">
                      +{selectedRestock.items.reduce((sum, x) => sum + x.quantityAdded, 0)}
                    </td>
                    <td className="p-3" />
                  </tr>
                </tbody>
              </table>
            </div>
            <button onClick={() => setSelectedRestock(null)} className="mt-4 px-4 py-2 bg-slate-200 rounded">
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      {showAddItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded max-w-sm w-full p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">{t('bar.addItem')}</h3>
              <button onClick={() => setShowAddItem(false)} className="text-slate-500">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">{t('bar.itemName')}</label>
                <input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('bar.itemPrice')}</label>
                <input type="number" min="0" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('bar.itemQuantity')}</label>
                <input type="number" min="0" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('bar.minStock')}</label>
                <input type="number" min="0" value={newItemMin} onChange={(e) => setNewItemMin(e.target.value)} className="w-full px-3 py-2 border rounded" placeholder="5" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveNewItem} disabled={addingItem} className="px-4 py-2 bg-teal-600 text-white rounded">
                {addingItem ? '...' : t('common.save')}
              </button>
              <button onClick={() => setShowAddItem(false)} className="px-4 py-2 bg-slate-200 rounded">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

function MyOrders({ token, autoTick }: { token: string; autoTick: number }) {
  const { t } = useTranslation();
  const searchQuery = useSearch((s) => s.query);
  const [orders, setOrders] = useState<
    { id: string; orderNumber: string; paymentMethod: string; createdAt: string; items: { id: string; quantity: number; name: string }[] }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'today' | 'week' | 'month' | 'bydate'>('today');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('period', filter);
    if (filter === 'bydate' && dateFrom && dateTo) {
      params.set('from', dateFrom);
      params.set('to', dateTo);
    }
    api(`/bar/orders/my?${params}`, { token })
      .then((res: any) => setOrders(res || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [token, filter, dateFrom, dateTo, autoTick]);

  const q = (searchQuery || '').trim().toLowerCase();
  const displayed = !q
    ? orders
    : orders.filter((o) => {
        const itemsTxt = (o.items || []).map((it) => `${it.name} x${it.quantity}`).join(', ');
        const txt = `${o.orderNumber} ${o.paymentMethod} ${itemsTxt}`.toLowerCase();
        return txt.includes(q);
      });

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="font-medium">{t('bar.myOrders')}</h3>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-2 py-1 border rounded text-xs sm:text-sm"
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
                className="px-2 py-1 border rounded text-xs sm:text-sm"
              />
              <span className="text-slate-400 text-xs sm:text-sm">{t('common.to')}</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2 py-1 border rounded text-xs sm:text-sm"
              />
            </div>
          )}
        </div>
      </div>
      <div className="bg-white border rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3">{t('common.date')}</th>
              <th className="text-left p-3">{t('bar.orderNo')}</th>
              <th className="text-left p-3">{t('bar.items')}</th>
              <th className="text-left p-3">{t('bar.payment')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-3 text-slate-500" colSpan={4}>
                  {t('common.loading')}
                </td>
              </tr>
            ) : displayed.length === 0 ? (
              <tr>
                <td className="p-3 text-slate-500" colSpan={4}>
                  {t('common.noItems')}
                </td>
              </tr>
            ) : (
              displayed.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="p-3">{new Date(o.createdAt).toLocaleString()}</td>
                  <td className="p-3 font-medium">{o.orderNumber}</td>
                  <td className="p-3 text-slate-700">
                    {(o.items || [])
                      .map((it) => `${it.name} x${it.quantity}`)
                      .filter(Boolean)
                      .join(', ') || '-'}
                  </td>
                  <td className="p-3">{o.paymentMethod}</td>
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
