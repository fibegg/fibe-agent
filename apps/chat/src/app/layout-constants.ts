export const SIDEBAR_WIDTH_PX = 320;
export const SIDEBAR_COLLAPSED_WIDTH_PX = 56;
export const SIDEBAR_COLLAPSE_STORAGE_KEY = 'phoenix-sidebar-collapsed';

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
