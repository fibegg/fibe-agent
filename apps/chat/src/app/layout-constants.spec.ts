import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SIDEBAR_COLLAPSED_WIDTH_PX,
  SIDEBAR_COLLAPSE_STORAGE_KEY,
  SIDEBAR_WIDTH_PX,
  getInitialSidebarCollapsed,
  persistSidebarCollapsed,
} from './layout-constants';

describe('layout-constants', () => {
  it('exports expected sidebar width values', () => {
    expect(SIDEBAR_WIDTH_PX).toBe(320);
    expect(SIDEBAR_COLLAPSED_WIDTH_PX).toBe(56);
  });

  it('exports storage key for sidebar collapse', () => {
    expect(SIDEBAR_COLLAPSE_STORAGE_KEY).toBe('phoenix-sidebar-collapsed');
  });
});

describe('getInitialSidebarCollapsed', () => {
  const key = SIDEBAR_COLLAPSE_STORAGE_KEY;

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when key is missing', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    expect(getInitialSidebarCollapsed()).toBe(false);
  });

  it('returns false when key is "false"', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('false');
    expect(getInitialSidebarCollapsed()).toBe(false);
  });

  it('returns true when key is "true"', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('true');
    expect(getInitialSidebarCollapsed()).toBe(true);
  });

  it('returns false when value is invalid JSON', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('invalid');
    expect(getInitialSidebarCollapsed()).toBe(false);
  });

  it('returns false when localStorage throws', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(getInitialSidebarCollapsed()).toBe(false);
  });
});

describe('persistSidebarCollapsed', () => {
  const key = SIDEBAR_COLLAPSE_STORAGE_KEY;

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes "true" when collapsed is true', () => {
    persistSidebarCollapsed(true);
    expect(localStorage.setItem).toHaveBeenCalledWith(key, 'true');
  });

  it('writes "false" when collapsed is false', () => {
    persistSidebarCollapsed(false);
    expect(localStorage.setItem).toHaveBeenCalledWith(key, 'false');
  });

  it('does not throw when localStorage throws', () => {
    (localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => persistSidebarCollapsed(true)).not.toThrow();
  });
});
