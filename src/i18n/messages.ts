import type { LocaleCode } from './locales';
import ruCatalog from './catalogs/ru.json';
import enCatalog from './catalogs/en.json';
import zhCatalog from './catalogs/zh.json';
import ukCatalog from './catalogs/uk.json';
import esCatalog from './catalogs/es.json';
import frCatalog from './catalogs/fr.json';
import hiCatalog from './catalogs/hi.json';

/** Flat message catalog. Missing keys fall back to English, then Russian, then the key. */
export type MessageKey = keyof typeof ruCatalog;

const ru = ruCatalog as Record<MessageKey, string>;
const en = enCatalog as Record<MessageKey, string>;
const zh = zhCatalog as Record<MessageKey, string>;
const uk = ukCatalog as Record<MessageKey, string>;
const es = esCatalog as Record<MessageKey, string>;
const fr = frCatalog as Record<MessageKey, string>;
const hi = hiCatalog as Record<MessageKey, string>;

export const MESSAGES: Record<LocaleCode, Record<MessageKey, string>> = {
  ru,
  en,
  zh,
  hi,
  es,
  fr,
  uk,
};

export function translate(locale: LocaleCode, key: MessageKey, vars?: Record<string, string | number>): string {
  const table = MESSAGES[locale] || MESSAGES.ru;
  let text = table[key] || MESSAGES.en[key] || MESSAGES.ru[key] || String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

/** Slavic-aware track count label */
export function formatTrackCount(
  locale: LocaleCode,
  count: number,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  const n = Math.abs(count);
  if (locale === 'ru' || locale === 'uk') {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return t('lib.trackOne', { count });
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return t('lib.trackFew', { count });
    return t('lib.trackMany', { count });
  }
  return n === 1 ? t('lib.trackOne', { count }) : t('lib.trackMany', { count });
}

const AUTO_PLAYLIST_KEYS: Record<string, MessageKey> = {
  'auto:frequent': 'auto.frequent',
  'auto:neglected': 'auto.neglected',
  'auto:liked-90s': 'auto.liked90s',
};

export function playlistDisplayName(
  playlist: { id: string; name: string },
  t: (key: MessageKey) => string,
): string {
  const key = AUTO_PLAYLIST_KEYS[playlist.id];
  return key ? t(key) : playlist.name;
}
