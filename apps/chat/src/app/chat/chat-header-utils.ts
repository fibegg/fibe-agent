/**
 * Shared floating-panel positioning utility.
 * Exported so ProviderModelMenu and MoreActionsMenu can share the same logic.
 */
export type FloatingPanelRect = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

export function computeFloatingPanelRect(anchor: HTMLElement, widthPx: number): FloatingPanelRect {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const gutter = 8;
  const width = Math.min(widthPx, viewportWidth - gutter * 2);
  const left = Math.min(
    Math.max(gutter, rect.left),
    Math.max(gutter, viewportWidth - width - gutter),
  );
  const top = Math.min(rect.bottom + 8, Math.max(gutter, viewportHeight - gutter - 180));
  return {
    top,
    left,
    width,
    maxHeight: Math.max(180, viewportHeight - top - gutter),
  };
}

/** CSS attribute used to identify the "more actions" floating panel. */
export const MORE_MENU_PANEL_ATTR = 'data-chat-header-more-menu';

/** CSS attribute used to identify the "provider/model" floating panel. */
export const PROVIDER_MODEL_PANEL_ATTR = 'data-provider-model-menu';

/** Base Tailwind class for menu items inside the MoreActionsMenu. */
export const MORE_MENU_ITEM_CLASS =
  'flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-foreground transition-colors hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

/** Active-state modifier for MORE_MENU_ITEM_CLASS. */
export const MORE_MENU_ITEM_ACTIVE_CLASS = 'bg-primary/15 text-primary';
