'use client';

import { useSearch } from '@/store/search';
import { useTranslation } from '@/lib/i18n/context';

export function HeaderSearch() {
  const { t } = useTranslation();
  const query = useSearch((s) => s.query);
  const setQuery = useSearch((s) => s.setQuery);
  const clear = useSearch((s) => s.clear);
  const hasQuery = query.trim().length > 0;

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-2 px-2 py-1 border rounded bg-white ${hasQuery ? 'ring-1 ring-teal-200 border-teal-200' : 'border-slate-200'}`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.35-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-[160px] sm:w-[220px] bg-transparent outline-none text-xs sm:text-sm"
          placeholder={t('common.searchPlaceholder')}
        />
      </div>
      {hasQuery && (
        <button
          type="button"
          onClick={clear}
          className="px-2 py-1 rounded hover:bg-slate-100 text-slate-600 text-xs sm:text-sm"
        >
          {t('common.clear')}
        </button>
      )}
    </div>
  );
}

