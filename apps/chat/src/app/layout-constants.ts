export const REFETCH_WHEN_EMPTY_MS = 8000;

export const SIDEBAR_WIDTH_PX = 280;
export const SIDEBAR_COLLAPSED_WIDTH_PX = 56;
export const MAIN_CONTENT_MIN_WIDTH_PX = 260;
export const PANEL_HEADER_MIN_HEIGHT_PX = 128;
export const SIDEBAR_COLLAPSE_STORAGE_KEY = 'phoenix-sidebar-collapsed';

export const RIGHT_SIDEBAR_WIDTH_PX = 280;
export const RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX = 48;
export const RIGHT_SIDEBAR_COLLAPSE_STORAGE_KEY = 'phoenix-right-sidebar-collapsed';

export function getInitialSidebarCollapsed(): boolean {
  try {
    return JSON.parse(
      localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) ?? 'false'
    ) as boolean;
  } catch {
    return false;
  }
}

export function persistSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(
      SIDEBAR_COLLAPSE_STORAGE_KEY,
      JSON.stringify(collapsed)
    );
  } catch {
    /* ignore */
  }
}

export function getInitialRightSidebarCollapsed(): boolean {
  try {
    return JSON.parse(
      localStorage.getItem(RIGHT_SIDEBAR_COLLAPSE_STORAGE_KEY) ?? 'false'
    ) as boolean;
  } catch {
    return false;
  }
}

export function persistRightSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(
      RIGHT_SIDEBAR_COLLAPSE_STORAGE_KEY,
      JSON.stringify(collapsed)
    );
  } catch {
    /* ignore */
  }
}
