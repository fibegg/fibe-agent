import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MAIN_CONTENT_MIN_WIDTH_PX,
  PANEL_HEADER_MIN_HEIGHT_PX,
  SIDEBAR_COLLAPSED_WIDTH_PX,
  SIDEBAR_COLLAPSE_STORAGE_KEY,
  SIDEBAR_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_WIDTH_STORAGE_KEY,
  RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX,
  RIGHT_SIDEBAR_COLLAPSE_STORAGE_KEY,
  RIGHT_SIDEBAR_WIDTH_PX,
  RIGHT_SIDEBAR_MIN_WIDTH_PX,
  RIGHT_SIDEBAR_MAX_WIDTH_PX,
  RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
  getInitialSidebarCollapsed,
  persistSidebarCollapsed,
  getInitialRightSidebarCollapsed,
  persistRightSidebarCollapsed,
  getInitialSidebarWidth,
  persistSidebarWidth,
  getInitialRightSidebarWidth,
  persistRightSidebarWidth,
} from './layout-constants';

describe('layout-constants', () => {
  it('exports expected sidebar width values', () => {
    expect(SIDEBAR_WIDTH_PX).toBe(280);
    expect(SIDEBAR_COLLAPSED_WIDTH_PX).toBe(56);
    expect(SIDEBAR_MIN_WIDTH_PX).toBe(180);
    expect(SIDEBAR_MAX_WIDTH_PX).toBe(520);
  });

  it('exports main content min width', () => {
    expect(MAIN_CONTENT_MIN_WIDTH_PX).toBe(260);
  });

  it('exports panel header min height', () => {
    expect(PANEL_HEADER_MIN_HEIGHT_PX).toBe(128);
  });

  it('exports storage key for sidebar collapse', () => {
    expect(SIDEBAR_COLLAPSE_STORAGE_KEY).toBe('fibe-sidebar-collapsed');
  });

  it('exports storage key for sidebar width', () => {
    expect(SIDEBAR_WIDTH_STORAGE_KEY).toBe('fibe-sidebar-width');
  });

  it('exports expected right sidebar width values', () => {
    expect(RIGHT_SIDEBAR_WIDTH_PX).toBe(280);
    expect(RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX).toBe(48);
    expect(RIGHT_SIDEBAR_MIN_WIDTH_PX).toBe(200);
    expect(RIGHT_SIDEBAR_MAX_WIDTH_PX).toBe(560);
  });

  it('exports storage key for right sidebar collapse', () => {
    expect(RIGHT_SIDEBAR_COLLAPSE_STORAGE_KEY).toBe(
      'fibe-right-sidebar-collapsed'
    );
  });

  it('exports storage key for right sidebar width', () => {
    expect(RIGHT_SIDEBAR_WIDTH_STORAGE_KEY).toBe('fibe-right-sidebar-width');
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

describe('getInitialSidebarWidth', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns SIDEBAR_WIDTH_PX when key is missing', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    expect(getInitialSidebarWidth()).toBe(280);
  });

  it('returns the stored number when present', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('350');
    expect(getInitialSidebarWidth()).toBe(350);
  });

  it('returns SIDEBAR_WIDTH_PX when stored value is non-numeric', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('bad');
    expect(getInitialSidebarWidth()).toBe(280);
  });

  it('returns SIDEBAR_WIDTH_PX when localStorage throws', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('unavailable');
    });
    expect(getInitialSidebarWidth()).toBe(280);
  });
});

describe('persistSidebarWidth', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes the width as a string', () => {
    persistSidebarWidth(320);
    expect(localStorage.setItem).toHaveBeenCalledWith('fibe-sidebar-width', '320');
  });

  it('does not throw when localStorage throws', () => {
    (localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => persistSidebarWidth(320)).not.toThrow();
  });
});

describe('getInitialRightSidebarWidth', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns RIGHT_SIDEBAR_WIDTH_PX when key is missing', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
    expect(getInitialRightSidebarWidth()).toBe(280);
  });

  it('returns the stored number when present', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('400');
    expect(getInitialRightSidebarWidth()).toBe(400);
  });

  it('returns RIGHT_SIDEBAR_WIDTH_PX when stored value is non-numeric', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('NaN');
    expect(getInitialRightSidebarWidth()).toBe(280);
  });
});

describe('persistRightSidebarWidth', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes the width as a string', () => {
    persistRightSidebarWidth(420);
    expect(localStorage.setItem).toHaveBeenCalledWith('fibe-right-sidebar-width', '420');
  });

  it('does not throw when localStorage throws', () => {
    (localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => persistRightSidebarWidth(420)).not.toThrow();
  });
});
