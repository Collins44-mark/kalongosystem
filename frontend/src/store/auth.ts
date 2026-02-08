import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type User = {
  id: string;
  email: string;
  name?: string;
  language?: string;
  businessId: string;
  role: string;
  activeWorkerId?: string | null;
  activeWorkerName?: string | null;
};

type AuthState = {
  token: string | null;
  user: User | null;
  _hasHydrated: boolean;
  /** Pending worker selection: role has workers, user must pick one before dashboard */
  pendingWorkerSelection: { workers: { id: string; fullName: string }[] } | null;
  setAuth: (token: string, user: User) => void;
  setAuthWithWorker: (token: string, user: User, worker: { id: string; fullName: string }) => void;
  setPendingWorkerSelection: (workers: { id: string; fullName: string }[] | null) => void;
  logout: () => void;
  setHasHydrated: (v: boolean) => void;
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      _hasHydrated: false,
      pendingWorkerSelection: null,
      setAuth: (token, user) => set({ token, user, pendingWorkerSelection: null }),
      setAuthWithWorker: (token, user, worker) =>
        set({
          token,
          user: { ...user, activeWorkerId: worker.id, activeWorkerName: worker.fullName },
          pendingWorkerSelection: null,
        }),
      setPendingWorkerSelection: (workers) =>
        set({ pendingWorkerSelection: workers ? { workers } : null }),
      logout: () => set({ token: null, user: null, pendingWorkerSelection: null }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'hms-auth',
      partialize: (s) => ({ token: s.token, user: s.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
