import { useStorage } from '@vueuse/core';
import { createI18n } from 'vue-i18n';
import { messages, type SupportedLocale } from './messages';

export type { SupportedLocale } from './messages';

export const LOCALE_STORAGE_KEY = 'll-predict-locale';
export const SUPPORTED_LOCALES = Object.keys(messages) as SupportedLocale[];

function normalizeLocale(input: string | null | undefined): SupportedLocale {
  if (!input) {
    return 'en';
  }

  const lower = input.toLowerCase();
  if (lower.startsWith('zh')) {
    return 'zh';
  }
  if (lower.startsWith('ja')) {
    return 'ja';
  }
  return 'en';
}

const storedLocale = useStorage<string | null>(LOCALE_STORAGE_KEY, null);

function detectInitialLocale(): SupportedLocale {
  const stored = storedLocale.value;
  if (stored && SUPPORTED_LOCALES.includes(stored as SupportedLocale)) {
    return stored as SupportedLocale;
  }

  const navigatorLocale = typeof navigator !== 'undefined' ? navigator.language : undefined;
  return normalizeLocale(navigatorLocale);
}

export const i18n = createI18n({
  legacy: false,
  locale: detectInitialLocale(),
  fallbackLocale: 'en',
  messages,
});

export function setLocale(locale: SupportedLocale) {
  i18n.global.locale.value = locale;
  storedLocale.value = locale;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

export function getLocale(): SupportedLocale {
  return i18n.global.locale.value;
}

export function t(key: string, values?: Record<string, unknown>) {
  if (values) {
    return i18n.global.t(key, values);
  }
  return i18n.global.t(key);
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.global.locale.value;
}
