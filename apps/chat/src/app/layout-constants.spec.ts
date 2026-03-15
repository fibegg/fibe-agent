import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MAIN_CONTENT_MIN_WIDTH_PX,
  CHAT_HEADER_PADDING_BOTTOM_PX,
  SIDEBAR_COLLAPSED_WIDTH_PX,
  SIDEBAR_COLLAPSE_STORAGE_KEY,
  SIDEBAR_WIDTH_PX,
  RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX,
  RIGHT_SIDEBAR_COLLAPSE_STORAGE_KEY,
  RIGHT_SIDEBAR_WIDTH_PX,
  getInitialSidebarCollapsed,
  persistSidebarCollapsed,
  getInitialRightSidebarCollapsed,
  persistRightSidebarCollapsed,
} from './layout-constants';

describe('layout-constants', () => {
  it('exports expected sidebar width values', () => {
    expect(SIDEBAR_WIDTH_PX).toBe(280);
    expect(SIDEBAR_COLLAPSED_WIDTH_PX).toBe(56);
  });

  it('exports main content min width', () => {
    expect(MAIN_CONTENT_MIN_WIDTH_PX).toBe(260);
  });

  it('exports chat header padding bottom', () => {
    expect(CHAT_HEADER_PADDING_BOTTOM_PX).toBe(16);
  });

  it('exports storage key for sidebar collapse', () => {
    expect(SIDEBAR_COLLAPSE_STORAGE_KEY).toBe('phoenix-sidebar-collapsed');
  });

  it('exports expected right sidebar width values', () => {
    expect(RIGHT_SIDEBAR_WIDTH_PX).toBe(280);
    expect(RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX).toBe(48);
  });

  it('exports storage key for right sidebar collapse', () => {
    expect(RIGHT_SIDEBAR_COLLAPSE_STORAGE_KEY).toBe(
      'phoenix-right-sidebar-collapsed'
    );
  });
});

describe('getInitialSidebarCollapsed', () => {
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

describe('getInitialRightSidebarCollapsed', () => {
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
    expect(getInitialRightSidebarCollapsed()).toBe(false);
  });

  it('returns true when key is "true"', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('true');
    expect(getInitialRightSidebarCollapsed()).toBe(true);
  });
});

describe('persistRightSidebarCollapsed', () => {
  const key = RIGHT_SIDEBAR_COLLAPSE_STORAGE_KEY;

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
    persistRightSidebarCollapsed(true);
    expect(localStorage.setItem).toHaveBeenCalledWith(key, 'true');
  });
});
