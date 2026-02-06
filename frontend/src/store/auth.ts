import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type User = {
  id: string;
  email: string;
  name?: string;
  businessId: string;
  role: string;
};

type AuthState = {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'hms-auth' }
  )
);
