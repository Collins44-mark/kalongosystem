import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type SearchState = {
  query: string;
  setQuery: (q: string) => void;
  clear: () => void;
};

/**
 * Global header search query.
 * Interpretation is page/role-specific: pages can subscribe and filter their own data.
 */
export const useSearch = create<SearchState>()(
  persist(
    (set) => ({
      query: '',
      setQuery: (q) => set({ query: q }),
      clear: () => set({ query: '' }),
    }),
    { name: 'hms-search', partialize: (s) => ({ query: s.query }) }
  )
);

