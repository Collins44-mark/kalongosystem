'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

type Room = { id: string; roomNumber: string; roomName?: string; status: string; category: { id: string; name: string; pricePerNight: string } };
type Category = { id: string; name: string; pricePerNight: string };
type Booking = {
  id: string;
  guestName: string;
  guestPhone?: string;
  room: Room;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: string;
  currency?: string;
  paymentMode?: string;
  status: string;
  folioNumber?: string;
  servedBy?: string;
};

const CURRENCIES = [
  { code: 'TZS', name: 'TZS', rate: 1 },
  { code: 'USD', name: 'USD', rate: 2500 },
  { code: 'EUR', name: 'EUR', rate: 2700 },
  { code: 'GBP', name: 'GBP', rate: 3100 },
];
const PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK', label: 'Bank' },
  { value: 'MPESA', label: 'M-Pesa' },
  { value: 'TIGOPESA', label: 'Tigo Pesa' },
  { value: 'AIRTEL_MONEY', label: 'Airtel Money' },
];

export default function FrontOfficePage() {
  const { token, user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<string>('rooms');
  const [loading, setLoading] = useState(true);
  const [bookingFilter, setBookingFilter] = useState<'today' | 'week' | 'month' | 'bydate'>('today');
  const [bookingDateFrom, setBookingDateFrom] = useState('');
  const [bookingDateTo, setBookingDateTo] = useState('');
  const [roomStatusFilter, setRoomStatusFilter] = useState<string>('all');

  const isManager = ['MANAGER', 'ADMIN', 'OWNER'].includes(user?.role || '');

  const { bookingFrom, bookingTo } = (() => {
    const now = new Date();
    if (bookingFilter === 'bydate' && bookingDateFrom && bookingDateTo) {
      return { bookingFrom: bookingDateFrom, bookingTo: bookingDateTo };
    }
    if (bookingFilter === 'bydate') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { bookingFrom: start.toISOString().slice(0, 10), bookingTo: end.toISOString().slice(0, 10) };
    }
    if (bookingFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { bookingFrom: start.toISOString().slice(0, 10), bookingTo: end.toISOString().slice(0, 10) };
    }
    if (bookingFilter === 'week') {
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { bookingFrom: start.toISOString().slice(0, 10), bookingTo: end.toISOString().slice(0, 10) };
    }
    if (bookingFilter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { bookingFrom: start.toISOString().slice(0, 10), bookingTo: now.toISOString().slice(0, 10) };
    }
    return { bookingFrom: '', bookingTo: '' };
  })();

  const managerTabs = [
    { id: 'rooms', label: 'Room Availability' },
    { id: 'setup', label: 'Room Setup' },
    { id: 'bookings', label: 'Bookings' },
    { id: 'history', label: 'Booking History' },
    { id: 'folios', label: 'Active Folios' },
    { id: 'new', label: 'New Booking' },
  ];
  const staffTabs = [
    { id: 'bookings', label: 'Bookings' },
    { id: 'history', label: 'Booking History' },
    { id: 'folios', label: 'Active Folios' },
  ];
  const tabs = isManager ? managerTabs : staffTabs;

  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams();
    if (activeTab === 'history') {
      params.set('scope', 'all');
      if (bookingFrom && bookingTo) {
        params.set('from', bookingFrom);
        params.set('to', bookingTo);
      }
    } else if (isManager) {
      params.set('scope', 'all');
      if (bookingFrom && bookingTo) {
        params.set('from', bookingFrom);
        params.set('to', bookingTo);
      }
    } else {
      params.set('scope', 'today');
    }
    Promise.allSettled([
      api<Category[]>('/hotel/categories', { token }),
      api<Room[]>('/hotel/rooms', { token }),
      api<Booking[]>(`/hotel/bookings?${params}`, { token }),
    ]).then((results) => {
      const [cRes, rRes, bRes] = results;
      setCategories((prev) =>
        cRes.status === 'fulfilled' && Array.isArray(cRes.value) ? cRes.value : prev
      );
      setRooms((prev) =>
        rRes.status === 'fulfilled' && Array.isArray(rRes.value) ? rRes.value : prev
      );
      setBookings((prev) =>
        bRes.status === 'fulfilled' && Array.isArray(bRes.value) ? bRes.value : prev
      );
    }).finally(() => setLoading(false));
  }, [token, isManager, activeTab, bookingFrom, bookingTo]);

  function refresh() {
    if (!token) return;
    const params = new URLSearchParams();
    if (activeTab === 'history') {
      params.set('scope', 'all');
      if (bookingFrom && bookingTo) {
        params.set('from', bookingFrom);
        params.set('to', bookingTo);
      }
    } else if (isManager) {
      params.set('scope', 'all');
      if (bookingFrom && bookingTo) {
        params.set('from', bookingFrom);
        params.set('to', bookingTo);
      }
    } else {
      params.set('scope', 'today');
    }
    Promise.allSettled([
      api<Category[]>('/hotel/categories', { token }),
      api<Room[]>('/hotel/rooms', { token }),
      api<Booking[]>(`/hotel/bookings?${params}`, { token }),
    ]).then((results) => {
      const [cRes, rRes, bRes] = results;
      setCategories((prev) =>
        cRes.status === 'fulfilled' && Array.isArray(cRes.value) ? cRes.value : prev
      );
      setRooms((prev) =>
        rRes.status === 'fulfilled' && Array.isArray(rRes.value) ? rRes.value : prev
      );
      setBookings((prev) =>
        bRes.status === 'fulfilled' && Array.isArray(bRes.value) ? bRes.value : prev
      );
      try { localStorage.setItem('hms-data-updated', String(Date.now())); } catch { /* ignore */ }
    });
  }

  if (loading) return <div className="text-slate-500">Loading...</div>;

  const activeFolios = bookings.filter((b) => b.status === 'CHECKED_IN');
  const historyBookings = bookings.filter((b) => b.status === 'CHECKED_OUT' || b.status === 'CANCELLED');
  const activeBookings = bookings.filter((b) => ['CONFIRMED', 'CHECKED_IN', 'RESERVED'].includes(b.status));

  return (
    <div className="min-w-0">
      <h1 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Front Office</h1>
      {isManager && (
        <p className="text-xs sm:text-sm text-slate-500 mb-2">Supervisory view — all features and controls</p>
      )}
      {!isManager && (
        <p className="text-xs sm:text-sm text-slate-500 mb-2">Operational view — today&apos;s tasks only</p>
      )}

      {(activeTab === 'bookings' || activeTab === 'history') && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
          <p className="text-sm text-slate-500">
            {activeTab === 'bookings' ? 'Active bookings' : 'Booking history'} — {bookingFilter === 'today' ? 'Today' : bookingFilter === 'week' ? 'This Week' : bookingFilter === 'month' ? 'This Month' : bookingDateFrom && bookingDateTo ? `${bookingDateFrom} to ${bookingDateTo}` : 'Select dates'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full bg-slate-100 p-1 gap-0.5">
              {(['today', 'week', 'month'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setBookingFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                    bookingFilter === f ? 'bg-white text-teal-600 shadow-sm ring-1 ring-teal-200' : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  {f === 'today' ? 'Today' : f === 'week' ? 'This Week' : 'This Month'}
                </button>
              ))}
              <button
                onClick={() => setBookingFilter('bydate')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  bookingFilter === 'bydate' ? 'bg-white text-teal-600 shadow-sm ring-1 ring-teal-200' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                By Date
              </button>
            </div>
            {bookingFilter === 'bydate' && (
              <div className="flex items-center gap-2">
                <input type="date" value={bookingDateFrom} onChange={(e) => setBookingDateFrom(e.target.value)} className="px-3 py-1.5 rounded-full border border-slate-200 text-sm" />
                <span className="text-slate-400">to</span>
                <input type="date" value={bookingDateTo} onChange={(e) => setBookingDateTo(e.target.value)} className="px-3 py-1.5 rounded-full border border-slate-200 text-sm" />
              </div>
            )}
            <button onClick={refresh} className="px-3 py-1.5 text-sm text-teal-600 hover:underline">Refresh</button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-3 sm:mb-4 overflow-x-auto pb-1 -mx-1 scrollbar-thin scrollbar-thumb-slate-300">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 sm:px-4 py-2 rounded text-sm whitespace-nowrap touch-manipulation min-h-[44px] sm:min-h-0 flex-shrink-0 ${activeTab === t.id ? 'bg-teal-600 text-white' : 'bg-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'rooms' && (
        <RoomAvailability
          rooms={rooms}
          isManager={isManager}
          roomStatusFilter={roomStatusFilter}
          onFilterChange={setRoomStatusFilter}
          categories={categories}
        />
      )}

      {activeTab === 'setup' && isManager && (
        <RoomSetup
          token={token!}
          categories={categories}
          rooms={rooms}
          onAction={refresh}
          onCategoryAdded={(cat) => setCategories((prev) => [...prev, { id: cat.id, name: cat.name, pricePerNight: String(cat.pricePerNight || '0') }])}
        />
      )}

      {activeTab === 'bookings' && (
        <BookingList
          bookings={activeBookings}
          token={token!}
          isManager={isManager}
          rooms={rooms}
          onAction={refresh}
        />
      )}

      {activeTab === 'history' && (
        <BookingList
          bookings={historyBookings}
          token={token!}
          isManager={isManager}
          rooms={rooms}
          onAction={refresh}
          readOnly={!isManager}
        />
      )}

      {activeTab === 'new' && isManager && (
        <NewBookingForm
          token={token!}
          categories={categories}
          rooms={rooms}
          onDone={() => { setActiveTab(isManager ? 'bookings' : 'bookings'); refresh(); }}
        />
      )}

      {activeTab === 'folios' && (
        <FolioList
          folios={activeFolios}
          token={token!}
          isManager={isManager}
          rooms={rooms}
          onAction={refresh}
        />
      )}
    </div>
  );
}

function RoomAvailability({
  rooms,
  isManager,
  roomStatusFilter,
  onFilterChange,
  categories,
}: {
  rooms: Room[];
  isManager: boolean;
  roomStatusFilter: string;
  onFilterChange: (v: string) => void;
  categories: Category[];
}) {
  const filteredRooms =
    roomStatusFilter === 'all'
      ? rooms
      : rooms.filter((r) => r.status === roomStatusFilter);

  const total = rooms.length;
  const occupied = rooms.filter((r) => r.status === 'OCCUPIED').length;
  const vacant = rooms.filter((r) => r.status === 'VACANT').length;
  const reserved = rooms.filter((r) => r.status === 'RESERVED').length;
  const maintenance = rooms.filter((r) => r.status === 'UNDER_MAINTENANCE').length;

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const roomsByCategory = [...new Set(filteredRooms.map((r) => r.category.id))].map((catId) => {
    const cat = categoryMap.get(catId) || { id: catId, name: filteredRooms.find((r) => r.category.id === catId)?.category.name ?? 'Other', pricePerNight: '0' };
    return { category: cat, rooms: filteredRooms.filter((r) => r.category.id === catId) };
  }).sort((a, b) => a.category.name.localeCompare(b.category.name));

  const statusByVariant: Record<string, string> = {
    total: 'all',
    occupied: 'OCCUPIED',
    vacant: 'VACANT',
    reserved: 'RESERVED',
    maintenance: 'UNDER_MAINTENANCE',
  };
  const RoomStatusCard = ({ label, value, variant }: { label: string; value: number; variant: keyof typeof statusByVariant }) => {
    const styles: Record<string, string> = {
      total: 'bg-[#0B3C5D] text-white',
      occupied: 'border-2 border-green-400 ring-2 ring-green-100 bg-white',
      vacant: 'border-2 border-slate-300 ring-2 ring-slate-100 bg-white',
      reserved: 'border-2 border-amber-400 ring-2 ring-amber-100 bg-white',
      maintenance: 'border-2 border-red-400 ring-2 ring-red-100 bg-white',
    };
    const valueColor = variant === 'occupied' ? 'text-green-600' : variant === 'vacant' ? 'text-slate-700' : variant === 'maintenance' ? 'text-red-600' : variant === 'reserved' ? 'text-amber-700' : variant === 'total' ? 'text-white' : 'text-slate-800';
    return (
      <button
        type="button"
        onClick={() => isManager && onFilterChange(statusByVariant[variant])}
        className={`rounded-xl p-5 shadow-md min-h-[100px] flex flex-col justify-center text-left w-full transition-all ${
          styles[variant]
        } ${isManager ? 'cursor-pointer hover:shadow-lg' : 'cursor-default'}`}
      >
        <div className={`text-sm font-medium ${variant === 'total' ? 'opacity-90' : 'text-slate-500'}`}>{label}</div>
        <div className={`text-2xl font-bold mt-0.5 ${valueColor}`}>{value}</div>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <RoomStatusCard label="Total Rooms" value={total} variant="total" />
        <RoomStatusCard label="Occupied" value={occupied} variant="occupied" />
        <RoomStatusCard label="Vacant" value={vacant} variant="vacant" />
        <RoomStatusCard label="Reserved" value={reserved} variant="reserved" />
        <RoomStatusCard label="Under Maintenance" value={maintenance} variant="maintenance" />
      </div>

      <div className="bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">
            Rooms {roomStatusFilter !== 'all' ? `— ${roomStatusFilter.replace('_', ' ')}` : ''}
          </h2>
        </div>
        <div className="p-4 space-y-6">
          {roomsByCategory.length > 0 ? (
            roomsByCategory.map(({ category, rooms: catRooms }) => (
              <div key={category.id}>
                <h3 className="text-sm font-medium text-slate-600 mb-2">{category.name}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                  {catRooms.map((r) => (
                    <div
                      key={r.id}
                      className={`p-3 sm:p-4 rounded-lg border min-h-[80px] flex flex-col justify-between ${
                        r.status === 'VACANT' ? 'bg-slate-100 border-slate-300' :
                        r.status === 'OCCUPIED' ? 'bg-green-50 border-green-200' :
                        r.status === 'RESERVED' ? 'bg-amber-50 border-amber-200' :
                        'bg-red-50 border-red-200'
                      }`}
                    >
                      <div>
                        <div className="font-medium text-sm sm:text-base">
                          {r.roomNumber}
                          {r.roomName && <span className="text-slate-600 font-normal ml-1">({r.roomName})</span>}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 sm:mt-2">{r.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="text-slate-500 text-sm py-4">No rooms match the selected filter.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function RoomSetup({
  token,
  categories,
  rooms,
  onAction,
  onCategoryAdded,
}: {
  token: string;
  categories: Category[];
  rooms: Room[];
  onAction: () => void;
  onCategoryAdded?: (cat: { id: string; name: string; pricePerNight?: string | number }) => void;
}) {
  const [catName, setCatName] = useState('');
  const [catPrice, setCatPrice] = useState('');
  const [roomCatId, setRoomCatId] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [roomName, setRoomName] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatPrice, setEditCatPrice] = useState('');
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editRoomNumber, setEditRoomNumber] = useState('');
  const [editRoomName, setEditRoomName] = useState('');
  const [editRoomCatId, setEditRoomCatId] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const roomsByCategory = [...new Set(rooms.map((r) => r.category.id))].map((catId) => {
    const cat = categoryMap.get(catId) || { id: catId, name: rooms.find((r) => r.category.id === catId)?.category.name ?? 'Other', pricePerNight: '0' };
    return { category: cat, rooms: rooms.filter((r) => r.category.id === catId) };
  }).sort((a, b) => a.category.name.localeCompare(b.category.name));

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!catName || !catPrice) return;
    const price = parseFloat(catPrice);
    if (isNaN(price) || price < 0) {
      alert('Please enter a valid price');
      return;
    }
    setLoading(true);
    try {
      const newCat = await api<{ id: string; name: string; pricePerNight: string | number }>('/hotel/categories', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: catName.trim(), pricePerNight: price }),
      });
      setCatName('');
      setCatPrice('');
      onCategoryAdded?.(newCat);
      onAction();
    } catch (err) {
      alert((err as Error).message || 'Failed to add category');
    } finally {
      setLoading(false);
    }
  }

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!roomCatId || !roomNumber) return;
    setLoading(true);
    try {
      await api('/hotel/rooms', {
        method: 'POST',
        token,
        body: JSON.stringify({
          categoryId: roomCatId,
          roomNumber: roomNumber.trim(),
          roomName: roomName.trim() || undefined,
        }),
      });
      setRoomCatId('');
      setRoomNumber('');
      setRoomName('');
      onAction();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function setRoomStatus(roomId: string, status: string) {
    try {
      await api(`/hotel/rooms/${roomId}/status`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ status }),
      });
      onAction();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function editCategory(cat: Category) {
    setEditingCategory(cat);
    setEditCatName(cat.name);
    setEditCatPrice(cat.pricePerNight);
  }

  async function saveCategory() {
    if (!editingCategory) return;
    const price = parseFloat(editCatPrice);
    if (isNaN(price) || price < 0) {
      alert('Please enter a valid price');
      return;
    }
    setLoading(true);
    try {
      await api(`/hotel/categories/${editingCategory.id}`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ name: editCatName.trim(), pricePerNight: price }),
      });
      setEditingCategory(null);
      onAction();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteCategory(categoryId: string) {
    const roomsInCategory = rooms.filter((r) => r.category.id === categoryId);
    if (roomsInCategory.length > 0) {
      alert('You must delete all rooms in this category first.');
      return;
    }
    try {
      await api(`/hotel/categories/${categoryId}`, { method: 'DELETE', token });
      onAction();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function editRoom(room: Room) {
    setEditingRoom(room);
    setEditRoomNumber(room.roomNumber);
    setEditRoomName(room.roomName || '');
    setEditRoomCatId(room.category.id);
  }

  async function saveRoom() {
    if (!editingRoom) return;
    setLoading(true);
    try {
      await api(`/hotel/rooms/${editingRoom.id}`, {
        method: 'PUT',
        token,
        body: JSON.stringify({
          roomNumber: editRoomNumber.trim(),
          roomName: editRoomName.trim() || undefined,
          categoryId: editRoomCatId,
        }),
      });
      setEditingRoom(null);
      onAction();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteRoom(roomId: string) {
    if (!confirm('Delete this room? Cannot delete if it has active or upcoming bookings.')) return;
    try {
      await api(`/hotel/rooms/${roomId}`, { method: 'DELETE', token });
      onAction();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border rounded-lg p-4 sm:p-5">
        <h2 className="text-base font-semibold mb-3">Step 1: Create Room Category</h2>
        <form onSubmit={createCategory} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-sm mb-1">Category name</label>
            <input
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="e.g. Standard, Deluxe"
              className="w-full px-3 py-2 border rounded text-base"
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Price per night</label>
            <input
              type="text"
              inputMode="decimal"
              value={catPrice}
              onChange={(e) => setCatPrice(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0"
              className="w-full px-3 py-2 border rounded text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={loading} className="px-4 py-2 bg-teal-600 text-white rounded touch-manipulation min-h-[44px]">
              Add Category
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white border rounded-lg p-4 sm:p-5">
        <h2 className="text-base font-semibold mb-3">Step 2: Create Room</h2>
        <form onSubmit={createRoom} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-sm mb-1">Room Category</label>
            <select
              value={roomCatId}
              onChange={(e) => setRoomCatId(e.target.value)}
              className="w-full px-3 py-2 border rounded text-base"
              required
            >
              <option value="">{categories.length === 0 ? 'Add a category above first' : 'Select category'}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Room number</label>
            <input
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              placeholder="e.g. 101"
              className="w-full px-3 py-2 border rounded text-base"
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Room name (optional)</label>
            <input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="e.g. Lake View"
              className="w-full px-3 py-2 border rounded text-base"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={loading} className="px-4 py-2 bg-teal-600 text-white rounded touch-manipulation min-h-[44px]">
              Add Room
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white border rounded-lg p-4 sm:p-5">
        <h2 className="text-base font-semibold mb-3">Your Categories</h2>
        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border relative">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-slate-500">— {formatTzs(parseFloat(c.pricePerNight || '0'))}/night</span>
                <div className="relative ml-1">
                  <button
                    type="button"
                    onClick={() => setOpenMenu(openMenu === `cat-chip-${c.id}` ? null : `cat-chip-${c.id}`)}
                    className="p-1 rounded hover:bg-slate-200 text-slate-500"
                    aria-label="Options"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>
                  </button>
                  {openMenu === `cat-chip-${c.id}` && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} aria-hidden />
                      <div className="absolute right-0 top-full mt-0.5 py-1 bg-white border rounded-lg shadow-lg z-20 min-w-[100px]">
                        <button onClick={() => { editCategory(c); setOpenMenu(null); }} className="block w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">Edit</button>
                        <button onClick={() => { deleteCategory(c.id); setOpenMenu(null); }} className="block w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">Delete</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 mb-4">No categories yet. Add one above.</p>
        )}
      </section>

      <section className="bg-white border rounded-lg p-4 sm:p-5">
        <h2 className="text-base font-semibold mb-3">Rooms by Category</h2>
        {roomsByCategory.length > 0 ? (
          <div className="space-y-6">
            {roomsByCategory.map(({ category, rooms: catRooms }) => (
              <div key={category.id} className="border rounded-xl p-4 bg-slate-50/50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-800">{category.name}</h3>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenu(openMenu === `cat-header-${category.id}` ? null : `cat-header-${category.id}`)}
                      className="p-1 rounded hover:bg-slate-200 text-slate-500"
                      aria-label="Options"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>
                    </button>
                    {openMenu === `cat-header-${category.id}` && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} aria-hidden />
                        <div className="absolute right-0 top-full mt-0.5 py-1 bg-white border rounded-lg shadow-lg z-20 min-w-[100px]">
                          <button onClick={() => { editCategory(category); setOpenMenu(null); }} className="block w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">Edit</button>
                          <button onClick={() => { deleteCategory(category.id); setOpenMenu(null); }} className="block w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {catRooms.map((r) => (
                    <div
                      key={r.id}
                      className={`p-3 rounded-lg border flex flex-col justify-between min-h-[80px] ${
                        r.status === 'VACANT' ? 'bg-slate-100 border-slate-300' :
                        r.status === 'OCCUPIED' ? 'bg-green-50 border-green-200' :
                        r.status === 'RESERVED' ? 'bg-amber-50 border-amber-200' :
                        'bg-red-50 border-red-200'
                      }`}
                    >
                      <div>
                        <div className="font-medium">{r.roomNumber}</div>
                        {r.roomName && <div className="text-xs text-slate-600">{r.roomName}</div>}
                        <div className="text-xs text-slate-500 mt-0.5">{r.status}</div>
                      </div>
                      <div className="flex items-center justify-end mt-2">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setOpenMenu(openMenu === `room-${r.id}` ? null : `room-${r.id}`)}
                            className="p-0.5 rounded hover:bg-slate-200 text-slate-500"
                            aria-label="Options"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>
                          </button>
                          {openMenu === `room-${r.id}` && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} aria-hidden />
                              <div className="absolute right-0 top-full mt-0.5 py-1 bg-white border rounded-lg shadow-lg z-20 min-w-[120px]">
                                <button onClick={() => { editRoom(r); setOpenMenu(null); }} className="block w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">Edit</button>
                                {(r.status === 'VACANT' || r.status === 'UNDER_MAINTENANCE') && (
                                  <button onClick={() => { setRoomStatus(r.id, r.status === 'VACANT' ? 'UNDER_MAINTENANCE' : 'VACANT'); setOpenMenu(null); }} className="block w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                                    {r.status === 'VACANT' ? 'Set maintenance' : 'Set available'}
                                  </button>
                                )}
                                <button onClick={() => { deleteRoom(r.id); setOpenMenu(null); }} className="block w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">Delete</button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-sm py-4">No rooms yet. Add a category above, then create rooms.</p>
        )}
      </section>

      {editingCategory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-5 rounded-lg max-w-sm w-full">
            <h3 className="font-semibold mb-3">Edit Category</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">Name</label>
                <input value={editCatName} onChange={(e) => setEditCatName(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm mb-1">Price per night</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editCatPrice}
                  onChange={(e) => setEditCatPrice(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="0"
                  className="w-full px-3 py-2 border rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveCategory} disabled={loading} className="px-4 py-2 bg-teal-600 text-white rounded">Save</button>
              <button onClick={() => setEditingCategory(null)} className="px-4 py-2 bg-slate-200 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editingRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-5 rounded-lg max-w-sm w-full">
            <h3 className="font-semibold mb-3">Edit Room</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">Category</label>
                <select value={editRoomCatId} onChange={(e) => setEditRoomCatId(e.target.value)} className="w-full px-3 py-2 border rounded">
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Room number</label>
                <input value={editRoomNumber} onChange={(e) => setEditRoomNumber(e.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm mb-1">Room name (optional)</label>
                <input value={editRoomName} onChange={(e) => setEditRoomName(e.target.value)} placeholder="e.g. Lake View" className="w-full px-3 py-2 border rounded" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveRoom} disabled={loading} className="px-4 py-2 bg-teal-600 text-white rounded">Save</button>
              <button onClick={() => setEditingRoom(null)} className="px-4 py-2 bg-slate-200 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BookingList({
  bookings,
  token,
  isManager,
  rooms,
  onAction,
  readOnly = false,
}: {
  bookings: Booking[];
  token: string;
  isManager: boolean;
  rooms: Room[];
  onAction: () => void;
  readOnly?: boolean;
}) {
  const vacantRooms = rooms.filter((r) => r.status === 'VACANT');

  async function checkIn(id: string) {
    try {
      await api(`/hotel/bookings/${id}/check-in`, { method: 'POST', token });
      onAction();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function checkOut(id: string) {
    try {
      await api(`/hotel/bookings/${id}/check-out`, { method: 'POST', token });
      onAction();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function cancel(id: string) {
    if (!confirm('Cancel this booking?')) return;
    try {
      await api(`/hotel/bookings/${id}/cancel`, { method: 'POST', token });
      onAction();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function changeRoom(bookingId: string, roomId: string) {
    try {
      await api(`/hotel/bookings/${bookingId}/room`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ roomId }),
      });
      onAction();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function overrideStatus(bookingId: string, status: string) {
    try {
      await api(`/hotel/bookings/${bookingId}/status`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ status }),
      });
      onAction();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="space-y-2 sm:space-y-3">
      {bookings.map((b) => (
        <div key={b.id} className="p-4 sm:p-5 bg-white border rounded-lg flex flex-col sm:flex-row sm:flex-wrap sm:justify-between sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-medium">{b.guestName}</div>
            <div className="text-sm text-slate-600">
              {b.room.roomNumber} · {b.nights} nights · {b.status}
            </div>
            <div className="text-xs text-slate-500">
              {new Date(b.checkIn).toLocaleDateString()} - {new Date(b.checkOut).toLocaleDateString()}
              {b.servedBy && ` · Served by: ${b.servedBy}`}
            </div>
          </div>
          <div className="text-sm font-medium flex-shrink-0">{formatTzs(parseFloat(b.totalAmount))}</div>
          {!readOnly && (
            <div className="flex flex-wrap gap-2 sm:gap-2 touch-manipulation">
              {b.status === 'CONFIRMED' && (
                <button onClick={() => checkIn(b.id)} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm touch-manipulation">
                  Check-in
                </button>
              )}
              {b.status === 'CHECKED_IN' && (
                <>
                  <button onClick={() => checkOut(b.id)} className="px-3 py-1.5 bg-teal-600 text-white rounded text-sm touch-manipulation">
                    Check-out
                  </button>
                  <ExtendStayModal booking={b} token={token} onDone={onAction} />
                </>
              )}
              {isManager && (b.status === 'CONFIRMED' || b.status === 'RESERVED') && (
                <button onClick={() => cancel(b.id)} className="px-3 py-1.5 bg-red-600 text-white rounded text-sm touch-manipulation">
                  Cancel
                </button>
              )}
              {isManager && (
                <select
                  value=""
                  onChange={(e) => { const v = e.target.value; if (v) overrideStatus(b.id, v); e.target.value = ''; }}
                  className="px-2 py-1.5 border rounded text-sm touch-manipulation"
                >
                  <option value="">Override status</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="CHECKED_IN">Checked In</option>
                  <option value="CHECKED_OUT">Checked Out</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              )}
              {(b.status === 'CONFIRMED' || b.status === 'CHECKED_IN') && vacantRooms.length > 0 && (
                <select
                  value=""
                  onChange={(e) => { const v = e.target.value; if (v) changeRoom(b.id, v); e.target.value = ''; }}
                  className="px-2 py-1.5 border rounded text-sm touch-manipulation"
                >
                  <option value="">Change room</option>
                  {vacantRooms.filter((r) => r.id !== b.room.id).map((r) => (
                    <option key={r.id} value={r.id}>{r.roomNumber}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      ))}
      {bookings.length === 0 && <p className="text-slate-500">No bookings</p>}
    </div>
  );
}

function ExtendStayModal({ booking, token, onDone }: { booking: Booking; token: string; onDone: () => void }) {
  const [show, setShow] = useState(false);
  const [checkOut, setCheckOut] = useState(booking.checkOut.slice(0, 10));
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      await api(`/hotel/bookings/${booking.id}/extend`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ checkOut }),
      });
      setShow(false);
      onDone();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button onClick={() => setShow(true)} className="px-3 py-1 bg-amber-600 text-white rounded text-sm">
        Extend
      </button>
      {show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded max-w-sm w-full">
            <h3 className="font-medium mb-2">Extend Stay</h3>
            <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full px-3 py-2 border rounded mb-2" />
            <div className="flex gap-2">
              <button onClick={submit} disabled={loading} className="px-4 py-2 bg-teal-600 text-white rounded">Extend</button>
              <button onClick={() => setShow(false)} className="px-4 py-2 bg-slate-200 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type FolioPayment = { id: string; amount: string; paymentMode: string; createdAt: string };

function AddPaymentModal({ booking, token, onDone }: { booking: Booking; token: string; onDone: () => void }) {
  const [show, setShow] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [loading, setLoading] = useState(false);

  async function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setLoading(true);
    try {
      await api(`/hotel/bookings/${booking.id}/payments`, {
        method: 'POST',
        token,
        body: JSON.stringify({ amount: amt, paymentMode }),
      });
      setShow(false);
      setAmount('');
      onDone();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button onClick={() => setShow(true)} className="px-3 py-1.5 bg-emerald-600 text-white rounded text-sm touch-manipulation">
        Add Payment
      </button>
      {show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-4 sm:p-5 rounded-lg max-w-sm w-full">
            <h3 className="font-medium mb-3">Add Payment — {booking.guestName}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border rounded text-base"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Payment mode</label>
                <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className="w-full px-3 py-2 border rounded text-base">
                  {PAYMENT_MODES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={submit} disabled={loading} className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded touch-manipulation">
                Add
              </button>
              <button onClick={() => setShow(false)} className="px-4 py-2.5 bg-slate-200 rounded touch-manipulation">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ViewPaymentsModal({ booking, token }: { booking: Booking; token: string }) {
  const [show, setShow] = useState(false);
  const [payments, setPayments] = useState<FolioPayment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (show && booking.id) {
      setLoading(true);
      api<FolioPayment[]>(`/hotel/bookings/${booking.id}/payments`, { token })
        .then(setPayments)
        .catch(() => setPayments([]))
        .finally(() => setLoading(false));
    }
  }, [show, booking.id, token]);

  return (
    <>
      <button onClick={() => setShow(true)} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded text-sm touch-manipulation">
        View Payments
      </button>
      {show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-4 sm:p-5 rounded-lg max-w-sm w-full max-h-[80vh] overflow-auto">
            <h3 className="font-medium mb-3">Payment history — {booking.guestName}</h3>
            {loading ? (
              <p className="text-slate-500">Loading...</p>
            ) : payments.length === 0 ? (
              <p className="text-slate-500">No payments recorded</p>
            ) : (
              <ul className="space-y-2">
                {payments.map((p) => (
                  <li key={p.id} className="flex justify-between text-sm py-2 border-b">
                    <span>{formatTzs(parseFloat(p.amount))} · {PAYMENT_MODES.find(m => m.value === p.paymentMode)?.label ?? p.paymentMode}</span>
                    <span className="text-slate-500 text-xs">{new Date(p.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => setShow(false)} className="mt-4 w-full px-4 py-2 bg-slate-200 rounded touch-manipulation">Close</button>
          </div>
        </div>
      )}
    </>
  );
}

function FolioList({
  folios,
  token,
  isManager,
  rooms,
  onAction,
}: {
  folios: Booking[];
  token: string;
  isManager: boolean;
  rooms: Room[];
  onAction: () => void;
}) {
  const vacantRooms = rooms.filter((r) => r.status === 'VACANT');

  async function checkOut(id: string) {
    try {
      await api(`/hotel/bookings/${id}/check-out`, { method: 'POST', token });
      onAction();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function changeRoom(bookingId: string, roomId: string) {
    try {
      await api(`/hotel/bookings/${bookingId}/room`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ roomId }),
      });
      onAction();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Active folios are checked-in bookings. View details and manage stay.</p>
      {folios.map((b) => (
        <div key={b.id} className="p-4 sm:p-5 bg-white border rounded-lg">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-3">
            <div>
              <div className="font-medium">{b.guestName} {b.guestPhone && `· ${b.guestPhone}`}</div>
              <div className="text-sm text-slate-600">Room {b.room.roomNumber} · {b.room.category?.name}</div>
              <div className="text-xs text-slate-500">
                {new Date(b.checkIn).toLocaleDateString()} - {new Date(b.checkOut).toLocaleDateString()} · {b.folioNumber ?? b.id}
                {b.servedBy && ` · Served by: ${b.servedBy}`}
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="font-semibold">{formatTzs(parseFloat(b.totalAmount))}</div>
              <div className="text-xs text-slate-500">Total charges</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-3 border-t">
            <button onClick={() => checkOut(b.id)} className="px-3 py-1.5 bg-teal-600 text-white rounded text-sm touch-manipulation">
              Check-out
            </button>
            <ExtendStayModal booking={b} token={token} onDone={onAction} />
            <AddPaymentModal booking={b} token={token} onDone={onAction} />
            {isManager && <ViewPaymentsModal booking={b} token={token} />}
            {vacantRooms.length > 0 && (
              <select
                value=""
                onChange={(e) => { const v = e.target.value; if (v) changeRoom(b.id, v); e.target.value = ''; }}
                className="px-2 py-1.5 border rounded text-sm touch-manipulation"
              >
                <option value="">Change room</option>
                {vacantRooms.filter((r) => r.id !== b.room.id).map((r) => (
                  <option key={r.id} value={r.id}>{r.roomNumber}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      ))}
      {folios.length === 0 && <p className="text-slate-500">No active folios</p>}
    </div>
  );
}

function NewBookingForm({
  token,
  categories,
  rooms,
  onDone,
}: {
  token: string;
  categories: Category[];
  rooms: Room[];
  onDone: () => void;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [currency, setCurrency] = useState('TZS');
  const [paymentMode, setPaymentMode] = useState('');
  const [totalOverride, setTotalOverride] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const category = categories.find((c) => c.id === categoryId);
  useEffect(() => {
    setTotalOverride('');
  }, [roomId, checkIn, checkOut]);
  const availableRooms = categoryId
    ? rooms.filter((r) => r.category.id === categoryId && r.status === 'VACANT')
    : [];
  const room = roomId ? availableRooms.find((r) => r.id === roomId) : null;
  const nights = checkIn && checkOut
    ? Math.max(0, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const pricePerNight = room ? parseFloat(room.category.pricePerNight) : category ? parseFloat(category.pricePerNight) : 0;
  const calculatedTotal = nights * pricePerNight;
  const totalTzs = totalOverride ? parseFloat(totalOverride.replace(/[^\d.]/g, '')) || calculatedTotal : calculatedTotal;
  const curr = CURRENCIES.find((c) => c.code === currency) || CURRENCIES[0];
  const totalDisplay = totalTzs / curr.rate;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!roomId || nights < 1) return;
    setLoading(true);
    try {
      await api('/hotel/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          roomId,
          guestName,
          guestPhone: guestPhone || undefined,
          checkIn,
          checkOut,
          nights,
          totalAmount: totalTzs,
          currency,
          paymentMode: paymentMode || undefined,
        }),
      });
      onDone();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      <div>
        <label className="block text-sm mb-1">Room Category</label>
        <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setRoomId(''); }} className="w-full px-3 py-2.5 border rounded text-base" required>
          <option value="">Select category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name} — {formatCurrency(parseFloat(c.pricePerNight), 'TZS')}/night</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm mb-1">Room (available only)</label>
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="w-full px-3 py-2.5 border rounded text-base touch-manipulation" required disabled={!categoryId}>
          <option value="">{categoryId && availableRooms.length === 0 ? 'No vacant rooms in this category' : 'Select room'}</option>
          {availableRooms.map((r) => (
            <option key={r.id} value={r.id}>{r.roomNumber}{r.roomName ? ` - ${r.roomName}` : ''} · {r.category.name}</option>
          ))}
        </select>
        {categoryId && availableRooms.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">All rooms in this category are booked or occupied.</p>
        )}
      </div>
      <div>
        <label className="block text-sm mb-1">Guest Name</label>
        <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className="w-full px-3 py-2.5 border rounded text-base" required />
      </div>
      <div>
        <label className="block text-sm mb-1">Phone / ID (optional)</label>
        <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} className="w-full px-3 py-2.5 border rounded text-base" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">Check-in</label>
          <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="w-full px-3 py-2.5 border rounded text-base" required />
        </div>
        <div>
          <label className="block text-sm mb-1">Check-out</label>
          <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full px-3 py-2.5 border rounded text-base" required />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm mb-1">Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full px-3 py-2.5 border rounded text-base">
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">Payment mode (optional)</label>
          <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className="w-full px-3 py-2.5 border rounded text-base">
            <option value="">—</option>
            {PAYMENT_MODES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="p-3 sm:p-4 bg-slate-50 rounded-lg text-sm space-y-2">
        <div>Nights: {nights}</div>
        <div>Price/night: {formatCurrency(pricePerNight, 'TZS')}</div>
        <div>
          <label className="block text-sm mb-1">Total amount (TZS)</label>
          <input
            type="text"
            inputMode="decimal"
            value={totalOverride || (calculatedTotal ? String(Math.round(calculatedTotal)) : '')}
            onChange={(e) => setTotalOverride(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder={calculatedTotal ? String(Math.round(calculatedTotal)) : '0'}
            className="w-full px-3 py-2 border rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <div className="font-medium">Display: {formatCurrency(totalDisplay, currency)}</div>
      </div>
      <button type="submit" disabled={loading} className="px-4 py-3 bg-teal-600 text-white rounded touch-manipulation min-h-[44px] w-full sm:w-auto">
        Create Booking
      </button>
    </form>
  );
}

function formatCurrency(n: number, currency: string = 'TZS') {
  return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

function formatTzs(n: number) {
  return formatCurrency(n, 'TZS');
}
