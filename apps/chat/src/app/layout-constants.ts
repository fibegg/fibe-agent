export const REFETCH_WHEN_EMPTY_MS = 8000;

export const SIDEBAR_WIDTH_PX = 280;
export const SIDEBAR_COLLAPSED_WIDTH_PX = 56;
export const SIDEBAR_MIN_WIDTH_PX = 180;
export const SIDEBAR_MAX_WIDTH_PX = 520;
export const MAIN_CONTENT_MIN_WIDTH_PX = 260;
export const PANEL_HEADER_MIN_HEIGHT_PX = 128;
export const SIDEBAR_OPEN_STORAGE_KEY = 'fibe-sidebar-open';
export const SIDEBAR_COLLAPSE_STORAGE_KEY = 'fibe-sidebar-collapsed';
export const SIDEBAR_WIDTH_STORAGE_KEY = 'fibe-sidebar-width';
export const CONVERSATION_SIDEBAR_COLLAPSE_STORAGE_KEY = 'fibe-conversations-collapsed';
export const COMPACT_FILE_BROWSER_OPEN_STORAGE_KEY = 'fibe-compact-file-browser-open';

export const RIGHT_SIDEBAR_WIDTH_PX = 280;
export const RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX = 48;
export const RIGHT_SIDEBAR_MIN_WIDTH_PX = 200;
export const RIGHT_SIDEBAR_MAX_WIDTH_PX = 560;
export const RIGHT_SIDEBAR_COLLAPSE_STORAGE_KEY = 'fibe-right-sidebar-collapsed';
export const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = 'fibe-right-sidebar-width';

function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(key) ?? JSON.stringify(fallback)
    ) as unknown;
    return typeof parsed === 'boolean' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function persistStoredBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function getInitialSidebarOpen(): boolean {
  return readStoredBoolean(SIDEBAR_OPEN_STORAGE_KEY, false);
}

export function persistSidebarOpen(open: boolean): void {
  persistStoredBoolean(SIDEBAR_OPEN_STORAGE_KEY, open);
}

export function getInitialSidebarCollapsed(): boolean {
  return readStoredBoolean(SIDEBAR_COLLAPSE_STORAGE_KEY, false);
}

export function persistSidebarCollapsed(collapsed: boolean): void {
  persistStoredBoolean(SIDEBAR_COLLAPSE_STORAGE_KEY, collapsed);
}

export function getInitialConversationSidebarCollapsed(): boolean {
  return readStoredBoolean(CONVERSATION_SIDEBAR_COLLAPSE_STORAGE_KEY, true);
}

export function persistConversationSidebarCollapsed(collapsed: boolean): void {
  persistStoredBoolean(CONVERSATION_SIDEBAR_COLLAPSE_STORAGE_KEY, collapsed);
}

export function getInitialCompactFileBrowserOpen(): boolean {
  return readStoredBoolean(COMPACT_FILE_BROWSER_OPEN_STORAGE_KEY, false);
}

export function persistCompactFileBrowserOpen(open: boolean): void {
  persistStoredBoolean(COMPACT_FILE_BROWSER_OPEN_STORAGE_KEY, open);
}

export function getInitialRightSidebarCollapsed(): boolean {
  return readStoredBoolean(RIGHT_SIDEBAR_COLLAPSE_STORAGE_KEY, false);
}

export function persistRightSidebarCollapsed(collapsed: boolean): void {
  persistStoredBoolean(RIGHT_SIDEBAR_COLLAPSE_STORAGE_KEY, collapsed);
}

export function getInitialSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (raw === null) return SIDEBAR_WIDTH_PX;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : SIDEBAR_WIDTH_PX;
  } catch {
    return SIDEBAR_WIDTH_PX;
  }
}

export function persistSidebarWidth(width: number): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width));
  } catch {
    /* ignore */
  }
}

export function getInitialRightSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(RIGHT_SIDEBAR_WIDTH_STORAGE_KEY);
    if (raw === null) return RIGHT_SIDEBAR_WIDTH_PX;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : RIGHT_SIDEBAR_WIDTH_PX;
  } catch {
    return RIGHT_SIDEBAR_WIDTH_PX;
  }
}

export function persistRightSidebarWidth(width: number): void {
  try {
    localStorage.setItem(RIGHT_SIDEBAR_WIDTH_STORAGE_KEY, String(width));
  } catch {
    /* ignore */
  }
}
