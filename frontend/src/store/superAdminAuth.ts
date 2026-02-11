import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SuperAdminUser = {
  id: string;
  email: string;
  name?: string;
  role: 'SUPER_ADMIN';
  businessId: 'HMS-1';
  language?: string;
};

type SuperAdminAuthState = {
  token: string | null;
  user: SuperAdminUser | null;
  _hasHydrated: boolean;
  setAuth: (token: string, user: SuperAdminUser) => void;
  logout: () => void;
  setHasHydrated: (v: boolean) => void;
};

export const useSuperAdminAuth = create<SuperAdminAuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      _hasHydrated: false,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),
    }),
    {
      name: 'hms-super-admin-auth',
      partialize: (s) => ({ token: s.token, user: s.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

