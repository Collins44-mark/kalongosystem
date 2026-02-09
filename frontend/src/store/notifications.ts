import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationType = 'success' | 'error' | 'info';

export type AppNotification = {
  id: string;
  type: NotificationType;
  message: string;
  createdAt: number;
  read: boolean;
};

type NotificationsState = {
  items: AppNotification[];
  add: (n: Omit<AppNotification, 'id' | 'createdAt' | 'read'> & { createdAt?: number }) => void;
  markAllRead: () => void;
  clear: () => void;
  remove: (id: string) => void;
};

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export const useNotifications = create<NotificationsState>()(
  persist(
    (set) => ({
      items: [],
      add: (n) =>
        set((s) => ({
          items: [
            {
              id: uid(),
              type: n.type,
              message: n.message,
              createdAt: n.createdAt ?? Date.now(),
              read: false,
            },
            ...s.items,
          ].slice(0, 100),
        })),
      markAllRead: () => set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })) })),
      clear: () => set({ items: [] }),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
    }),
    {
      name: 'hms-notifications',
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

export function notifySuccess(message: string) {
  useNotifications.getState().add({ type: 'success', message });
}
export function notifyError(message: string) {
  useNotifications.getState().add({ type: 'error', message });
}
export function notifyInfo(message: string) {
  useNotifications.getState().add({ type: 'info', message });
}

