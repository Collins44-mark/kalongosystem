'use client';

import { useMemo, useState } from 'react';
import { useNotifications } from '@/store/notifications';

export function NotificationsPanel() {
  const { items, markAllRead, clear, remove } = useNotifications();
  const [open, setOpen] = useState(false);

  const unreadCount = useMemo(() => items.filter((i) => !i.read).length, [items]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) markAllRead();
        }}
        className="relative p-2 rounded hover:bg-slate-100"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6 6 0 1 0-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 0 1-6 0m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] leading-4 min-w-[16px] h-4 px-1 rounded-full text-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full mt-2 w-[320px] max-w-[90vw] bg-white border rounded-lg shadow-lg z-20 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50">
              <div className="text-sm font-medium text-slate-700">Notifications</div>
              <div className="flex items-center gap-2">
                <button onClick={clear} className="text-xs text-slate-600 hover:underline">
                  Clear
                </button>
                <button onClick={() => setOpen(false)} className="text-xs text-slate-600 hover:underline">
                  Close
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              {items.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">No notifications</div>
              ) : (
                items.map((n) => (
                  <div key={n.id} className="px-3 py-2 border-b last:border-b-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className={`text-xs font-medium ${
                          n.type === 'success' ? 'text-green-700' : n.type === 'error' ? 'text-red-700' : 'text-slate-700'
                        }`}>
                          {n.type.toUpperCase()}
                        </div>
                        <div className="text-sm text-slate-800 break-words">{n.message}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {new Date(n.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <button
                        onClick={() => remove(n.id)}
                        className="text-xs text-slate-400 hover:text-slate-700"
                        aria-label="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

