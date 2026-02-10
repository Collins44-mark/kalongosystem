'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearch } from '@/store/search';
import { useTranslation } from '@/lib/i18n/context';

export function HeaderSearch() {
  const { t } = useTranslation();
  const query = useSearch((s) => s.query);
  const setQuery = useSearch((s) => s.setQuery);
  const clear = useSearch((s) => s.clear);
  const [open, setOpen] = useState(false);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const hasQuery = useMemo(() => query.trim().length > 0, [query]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`px-2 py-1 rounded hover:bg-slate-100 text-slate-600 text-xs sm:text-sm flex items-center gap-1 ${
          hasQuery ? 'ring-1 ring-teal-200' : ''
        }`}
        aria-label={t('common.search')}
        title={t('common.search')}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.35-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="hidden sm:inline">{t('common.search')}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full mt-2 z-20 w-[min(92vw,420px)] bg-white border rounded-lg shadow-lg p-3">
            <div className="flex items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 px-3 py-2 border rounded text-sm"
                placeholder={t('common.searchPlaceholder')}
                autoFocus
              />
              {hasQuery && (
                <button
                  type="button"
                  onClick={clear}
                  className="px-3 py-2 bg-slate-200 rounded text-sm"
                >
                  {t('common.clear')}
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">{t('common.searchHint')}</p>
          </div>
        </>
      )}
    </div>
  );
}

