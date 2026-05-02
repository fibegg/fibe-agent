import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard, makeClientId, safeScrollIntoView } from './browser-compat';

describe('browser compatibility helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses crypto.randomUUID when available', () => {
    const randomUUID = vi.fn().mockReturnValue('uuid-1');
    vi.stubGlobal('crypto', { randomUUID });

    expect(makeClientId('toast')).toBe('uuid-1');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('falls back to a local id when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {});
    vi.spyOn(Date, 'now').mockReturnValue(123456);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(makeClientId('toast')).toMatch(/^toast-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
  });

  it('uses navigator.clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyTextToClipboard('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand copy when async clipboard is unavailable', async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', {});
    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
    });

    await expect(copyTextToClipboard('legacy')).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('falls back to no-argument scrollIntoView when options are unsupported', () => {
    const element = document.createElement('div');
    const scrollIntoView = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new TypeError('options unsupported');
      })
      .mockImplementationOnce(() => undefined);
    element.scrollIntoView = scrollIntoView;

    safeScrollIntoView(element, { behavior: 'smooth', block: 'nearest' });

    expect(scrollIntoView).toHaveBeenNthCalledWith(1, { behavior: 'smooth', block: 'nearest' });
    expect(scrollIntoView).toHaveBeenNthCalledWith(2);
  });
});
