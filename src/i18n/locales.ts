export type LocaleCode = 'ru' | 'en' | 'zh' | 'hi' | 'es' | 'fr' | 'uk';

export const LOCALES: { code: LocaleCode; label: string; bcp47: string }[] = [
  { code: 'ru', label: 'Русский', bcp47: 'ru' },
  { code: 'en', label: 'English', bcp47: 'en' },
  { code: 'zh', label: '中文', bcp47: 'zh-CN' },
  { code: 'hi', label: 'हिन्दी', bcp47: 'hi' },
  { code: 'es', label: 'Español', bcp47: 'es' },
  { code: 'fr', label: 'Français', bcp47: 'fr' },
  { code: 'uk', label: 'Українська', bcp47: 'uk' },
];

export const DEFAULT_LOCALE: LocaleCode = 'ru';

export function normalizeLocale(raw: unknown): LocaleCode {
  const v = String(raw || '').toLowerCase();
  if (LOCALES.some((l) => l.code === v)) return v as LocaleCode;
  return DEFAULT_LOCALE;
}

export function localeBcp47(code: LocaleCode): string {
  return LOCALES.find((l) => l.code === code)?.bcp47 || 'ru';
}
