import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { LocaleCode } from './locales';
import { DEFAULT_LOCALE, normalizeLocale, localeBcp47 } from './locales';
import { translate, type MessageKey } from './messages';
import { chartCountryOptions } from './chartCountries';

type I18nContextValue = {
  locale: LocaleCode;
  bcp47: string;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  chartCountries: { value: string; label: string }[];
};

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  bcp47: 'ru',
  t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
  chartCountries: chartCountryOptions(DEFAULT_LOCALE),
});

export function I18nProvider({
  locale,
  children,
}: {
  locale?: string | null;
  children: ReactNode;
}) {
  const code = normalizeLocale(locale);
  const value = useMemo<I18nContextValue>(() => {
    const bcp47 = localeBcp47(code);
    return {
      locale: code,
      bcp47,
      t: (key, vars) => translate(code, key, vars),
      chartCountries: chartCountryOptions(code),
    };
  }, [code]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
