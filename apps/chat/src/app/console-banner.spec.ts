import { describe, it, expect, vi, afterEach } from 'vitest';
import { logConsoleBanner } from './console-banner';

describe('logConsoleBanner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('calls console.log once', () => {
    vi.stubGlobal('__APP_VERSION__', '1.0.0');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logConsoleBanner();
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('passes the banner string as first argument', () => {
    vi.stubGlobal('__APP_VERSION__', '2.0.0');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logConsoleBanner();
    const firstArg = logSpy.mock.calls[0][0];
    expect(typeof firstArg).toBe('string');
    expect(firstArg).toContain('fibe');
  });

  it('passes multiple CSS style arguments', () => {
    vi.stubGlobal('__APP_VERSION__', '1.0.0');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logConsoleBanner();
    // Should have banner + 6 style strings
    expect(logSpy.mock.calls[0].length).toBeGreaterThanOrEqual(3);
  });
});
