'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Locale = 'en' | 'sw';

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

let translations: Record<string, Record<string, string>> = {};

async function loadTranslations(locale: Locale): Promise<Record<string, string>> {
  if (translations[locale]) return translations[locale];
  const mod = await import(`./translations/${locale}.json`);
  translations[locale] = mod.default;
  return mod.default;
}

function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const s = localStorage.getItem('hms-locale');
    if (s === 'en' || s === 'sw') return s;
  } catch {
    /* ignore */
  }
  return 'en';
}

export function I18nProvider({
  children,
  onLocaleChange,
}: {
  children: React.ReactNode;
  onLocaleChange?: (locale: Locale) => void;
}) {
  const [locale, setLocaleState] = useState<Locale>(getStoredLocale);
  const [dict, setDict] = useState<Record<string, string>>({});

  useEffect(() => {
    loadTranslations(locale).then(setDict);
  }, [locale]);

  const setLocale = useCallback(
    (newLocale: Locale) => {
      setLocaleState(newLocale);
      onLocaleChange?.(newLocale);
      try {
        localStorage.setItem('hms-locale', newLocale);
      } catch {
        /* ignore */
      }
    },
    [onLocaleChange]
  );

  const t = useCallback(
    (key: string): string => {
      return dict[key] ?? key;
    },
    [dict]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      t: (key: string) => key,
      locale: 'en' as Locale,
      setLocale: () => {},
    };
  }
  return ctx;
}
