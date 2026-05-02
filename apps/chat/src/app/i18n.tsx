import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LOCALES, LOCALE_OPTIONS, TRANSLATIONS, type Locale, type TranslationKey } from './i18n/locales';

export { LOCALES, LOCALE_OPTIONS };
export type { Locale, TranslationKey };

const STORAGE_KEY = 'chat-locale';
const LOCALE_CHANGED_EVENT = 'fibe_locale_changed';
const DEFAULT_LOCALE: Locale = 'en';
const LOCALE_REQUEST_TYPE = 'locale_request';
const LOCALE_REQUEST_RETRY_DELAYS_MS = [50, 250, 1000, 2500, 5000, 10000] as const;

let frameLocaleReceived = false;
let frameLocaleRequestTimers: number[] = [];

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALES.includes(value as Locale);
}

function localeFromLanguage(value: unknown): Locale | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase();
  if (isLocale(normalized)) return normalized;
  const base = normalized.split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

function urlLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  return localeFromLanguage(new URLSearchParams(window.location.search).get('locale'));
}

function bootLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  return localeFromLanguage(window.__FIBE_BOOT_LOCALE__);
}

export function isSetLocaleMessage(data: unknown): data is { action: 'set_locale'; locale: Locale; requestId?: string } {
  const o = data as Record<string, unknown> | null;
  return o !== null && typeof o === 'object' && o.action === 'set_locale' && isLocale(o.locale);
}

function applyLocale(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
}

export function getStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function browserLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of languages) {
    const locale = localeFromLanguage(language);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export function getInitialLocale(): Locale {
  return bootLocale() ?? urlLocale() ?? getStoredLocale() ?? browserLocale();
}

export function translate(key: TranslationKey, params: Record<string, string | number> = {}, locale = getInitialLocale()): string {
  const template = TRANSLATIONS[locale]?.[key] ?? TRANSLATIONS[DEFAULT_LOCALE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export function setStoredLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // localStorage can be unavailable in restrictive embed contexts.
  }
  window.__FIBE_BOOT_LOCALE__ = locale;
  applyLocale(locale);
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGED_EVENT, { detail: { locale } }));
}

export function requestFrameLocale(): void {
  if (typeof window === 'undefined' || window === window.parent) return;
  if (typeof window.parent.postMessage !== 'function') return;

  try {
    window.parent.postMessage({ type: LOCALE_REQUEST_TYPE }, '*');
  } catch {
    // A parent frame may reject postMessage in unusual embed contexts.
  }
}

function clearFrameLocaleRequestTimers(): void {
  if (typeof window === 'undefined') {
    frameLocaleRequestTimers = [];
    return;
  }
  frameLocaleRequestTimers.forEach((timer) => window.clearTimeout(timer));
  frameLocaleRequestTimers = [];
}

function scheduleFrameLocaleRequests(): void {
  if (typeof window === 'undefined' || window === window.parent || frameLocaleReceived) return;
  if (frameLocaleRequestTimers.length > 0) return;

  requestFrameLocale();
  frameLocaleRequestTimers = LOCALE_REQUEST_RETRY_DELAYS_MS.map((delay, index) => window.setTimeout(() => {
    if (frameLocaleReceived) return;
    requestFrameLocale();
    if (index === LOCALE_REQUEST_RETRY_DELAYS_MS.length - 1) {
      frameLocaleRequestTimers = [];
    }
  }, delay));
}

function handleFrameLocaleMessage(event: MessageEvent): void {
  if (!isSetLocaleMessage(event.data)) return;
  frameLocaleReceived = true;
  clearFrameLocaleRequestTimers();
  setStoredLocale(event.data.locale);
  acknowledgeFrameLocaleMessage(event.data.locale, event.data.requestId, event.origin);
}

function acknowledgeFrameLocaleMessage(locale: Locale, requestId: string | undefined, origin: string): void {
  if (typeof window === 'undefined' || window === window.parent) return;
  if (typeof window.parent.postMessage !== 'function') return;
  const targetOrigin = origin && origin !== 'null' ? origin : '*';
  try {
    window.parent.postMessage({ type: 'locale_applied', locale, requestId }, targetOrigin);
  } catch {
    window.parent.postMessage({ type: 'locale_applied', locale, requestId }, '*');
  }
}

function initFrameLocaleListener(): void {
  if (typeof window === 'undefined' || window === window.parent) return;

  const existing = window.__locale_listener;
  if (existing) {
    window.removeEventListener('message', existing);
  }
  window.addEventListener('message', handleFrameLocaleMessage);
  window.__locale_listener = handleFrameLocaleMessage;
  scheduleFrameLocaleRequests();
}

export function resetI18nFrameLocaleForTest(): void {
  frameLocaleReceived = false;
  clearFrameLocaleRequestTimers();
  if (typeof window !== 'undefined' && window.__locale_listener) {
    window.removeEventListener('message', window.__locale_listener);
    delete window.__locale_listener;
  }
}

const defaultContext: I18nContextValue = {
  locale: getInitialLocale(),
  setLocale: setStoredLocale,
  t: translate,
};

const I18nContext = createContext<I18nContextValue>(defaultContext);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getInitialLocale());

  const setLocale = useCallback((next: Locale) => {
    setStoredLocale(next);
    setLocaleState(next);
  }, []);

  useEffect(() => {
    applyLocale(locale);
  }, [locale]);

  useEffect(() => {
    const handleLocaleChanged = (event: Event) => {
      const next = (event as CustomEvent<{ locale?: unknown }>).detail?.locale;
      if (isLocale(next)) setLocaleState(next);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      if (isLocale(event.newValue)) setLocaleState(event.newValue);
    };
    window.addEventListener(LOCALE_CHANGED_EVENT, handleLocaleChanged);
    window.addEventListener('storage', handleStorage);
    const initial = getInitialLocale();
    setLocaleState(initial);
    if (urlLocale()) setStoredLocale(initial);
    scheduleFrameLocaleRequests();
    return () => {
      window.removeEventListener(LOCALE_CHANGED_EVENT, handleLocaleChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t: (key, params) => translate(key, params, locale),
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export function useT(): I18nContextValue['t'] {
  return useI18n().t;
}

export function localeLabel(locale: Locale): string {
  const labelKey = LOCALE_OPTIONS[locale].labelKey;
  return TRANSLATIONS[locale][labelKey] ?? TRANSLATIONS[DEFAULT_LOCALE][labelKey];
}

initFrameLocaleListener();
