import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCALE_OPTIONS, isSetLocaleMessage, localeLabel, translate } from './i18n';

describe('i18n', () => {
  afterEach(async () => {
    const { resetI18nFrameLocaleForTest } = await import('./i18n');
    resetI18nFrameLocaleForTest();
    localStorage.clear();
    document.documentElement.lang = '';
    delete window.__FIBE_BOOT_LOCALE__;
    window.history.replaceState(null, '', '/');
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('translates English and Ukrainian keys', () => {
    expect(translate('settings.title', {}, 'en')).toBe('Settings');
    expect(translate('settings.title', {}, 'uk')).toBe('Налаштування');
  });

  it('interpolates translation params', () => {
    expect(translate('header.foundMany', { count: 7 }, 'en')).toBe('Found 7 messages');
  });

  it('keeps locale metadata separate from UI rendering', () => {
    expect(LOCALE_OPTIONS.en.shortLabel).toBe('EN');
    expect(LOCALE_OPTIONS.uk.shortLabel).toBe('УКР');
    expect(localeLabel('uk')).toBe('Українська');
  });

  it('captures frame locale messages before React provider effects run', async () => {
    vi.resetModules();
    vi.stubGlobal('parent', {} as Window);

    await import('./i18n');
    window.dispatchEvent(new MessageEvent('message', { data: { action: 'set_locale', locale: 'uk' } }));

    expect(localStorage.getItem('chat-locale')).toBe('uk');
    expect(document.documentElement.lang).toBe('uk');
  });

  it('requests the parent locale as soon as the frame listener is installed', async () => {
    const parentWindow = { postMessage: vi.fn() } as unknown as Window;
    vi.resetModules();
    vi.stubGlobal('parent', parentWindow);

    await import('./i18n');

    expect(parentWindow.postMessage).toHaveBeenCalledWith({ type: 'locale_request' }, '*');
  });

  it('acknowledges frame locale messages after storing the locale', async () => {
    const parentWindow = { postMessage: vi.fn() } as unknown as Window;
    vi.resetModules();
    vi.stubGlobal('parent', parentWindow);

    await import('./i18n');
    window.dispatchEvent(new MessageEvent('message', {
      data: { action: 'set_locale', locale: 'uk', requestId: 'locale-sync-1' },
      origin: 'http://rails.test:3000',
    }));

    expect(localStorage.getItem('chat-locale')).toBe('uk');
    expect(parentWindow.postMessage).toHaveBeenCalledWith(
      { type: 'locale_applied', locale: 'uk', requestId: 'locale-sync-1' },
      'http://rails.test:3000',
    );
  });

  it('prefers locale from URL over stored locale for iframe bootstrap', async () => {
    localStorage.setItem('chat-locale', 'en');
    window.history.replaceState(null, '', '/?locale=uk');
    const { getInitialLocale } = await import('./i18n');

    expect(getInitialLocale()).toBe('uk');
  });

  it('prefers synchronous boot locale over URL and storage', async () => {
    localStorage.setItem('chat-locale', 'en');
    window.history.replaceState(null, '', '/?locale=en');
    window.__FIBE_BOOT_LOCALE__ = 'uk';
    const { getInitialLocale } = await import('./i18n');

    expect(getInitialLocale()).toBe('uk');
  });

  it('recognizes locale postMessage payloads', () => {
    expect(isSetLocaleMessage({ action: 'set_locale', locale: 'uk' })).toBe(true);
    expect(isSetLocaleMessage({ action: 'set_locale', locale: 'de' })).toBe(false);
    expect(isSetLocaleMessage({ action: 'set_theme', theme: 'dark' })).toBe(false);
  });
});
