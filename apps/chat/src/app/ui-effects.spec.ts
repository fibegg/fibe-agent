import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'chat-ui-effects-enabled';

describe('ui effects preference', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.documentElement.removeAttribute('data-ui-effects');
  });

  it('defaults to enabled when nothing is stored', async () => {
    const { areUiEffectsEnabled } = await import('./ui-effects');
    expect(areUiEffectsEnabled()).toBe(true);
  });

  it('treats invalid stored values as enabled', async () => {
    localStorage.setItem(STORAGE_KEY, 'maybe');
    const { areUiEffectsEnabled } = await import('./ui-effects');
    expect(areUiEffectsEnabled()).toBe(true);
  });

  it('stores disabled state and marks the root as reduced', async () => {
    const { setUiEffectsEnabled } = await import('./ui-effects');
    setUiEffectsEnabled(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
    expect(document.documentElement.dataset.uiEffects).toBe('reduced');
  });

  it('stores enabled state and removes the reduced marker', async () => {
    const { setUiEffectsEnabled } = await import('./ui-effects');
    document.documentElement.dataset.uiEffects = 'reduced';
    setUiEffectsEnabled(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    expect(document.documentElement.dataset.uiEffects).toBeUndefined();
  });

  it('recognizes iframe ui-effects messages', async () => {
    const { isSetUiEffectsMessage } = await import('./ui-effects');
    expect(isSetUiEffectsMessage({ action: 'set_ui_effects', enabled: false })).toBe(true);
    expect(isSetUiEffectsMessage({ action: 'set_ui_effects', enabled: 'false' })).toBe(false);
    expect(isSetUiEffectsMessage({ action: 'set_theme', theme: 'dark' })).toBe(false);
  });

  it('applies and persists iframe ui-effects messages when embedded', async () => {
    const originalParent = window.parent;
    Object.defineProperty(window, 'parent', { configurable: true, value: {} });
    const { initUiEffects } = await import('./ui-effects');

    initUiEffects();
    window.dispatchEvent(new MessageEvent('message', {
      data: { action: 'set_ui_effects', enabled: false },
    }));

    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
    expect(document.documentElement.dataset.uiEffects).toBe('reduced');

    Object.defineProperty(window, 'parent', { configurable: true, value: originalParent });
  });
});
