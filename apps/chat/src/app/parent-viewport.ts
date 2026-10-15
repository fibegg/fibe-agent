export interface ParentViewportMessage {
  type: 'viewport';
  height: number;
  width?: number;
  offsetTop?: number;
  offsetLeft?: number;
  frameTop?: number;
  frameLeft?: number;
  pageTop?: number;
  pageLeft?: number;
  safeArea?: ParentSafeArea;
}

export interface ParentSafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const MAX_SAFE_AREA_PX = 200;

const MAX_VIEWPORT_PX = 10000;

let parentViewportListenerInitialized = false;

function isFiniteViewportNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_VIEWPORT_PX;
}

function isOptionalPositiveViewportNumber(value: unknown): value is number | undefined {
  return value === undefined || isFiniteViewportNumber(value);
}

function isOptionalViewportOffset(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_VIEWPORT_PX);
}

function isOptionalScrollNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isSafeAreaInset(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_SAFE_AREA_PX;
}

function isOptionalSafeArea(value: unknown): value is ParentSafeArea | undefined {
  if (value === undefined) return true;
  if (value === null || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return isSafeAreaInset(o.top) && isSafeAreaInset(o.right) && isSafeAreaInset(o.bottom) && isSafeAreaInset(o.left);
}

export function isParentViewportMessage(data: unknown): data is ParentViewportMessage {
  const o = data as Record<string, unknown> | null;
  return (
    o !== null &&
    typeof o === 'object' &&
    o.type === 'viewport' &&
    isFiniteViewportNumber(o.height) &&
    isOptionalPositiveViewportNumber(o.width) &&
    isOptionalViewportOffset(o.offsetTop) &&
    isOptionalViewportOffset(o.offsetLeft) &&
    isOptionalViewportOffset(o.frameTop) &&
    isOptionalViewportOffset(o.frameLeft) &&
    isOptionalScrollNumber(o.pageTop) &&
    isOptionalScrollNumber(o.pageLeft) &&
    isOptionalSafeArea(o.safeArea)
  );
}

function setOptionalPixelProperty(name: string, value: number | undefined): void {
  if (value === undefined) return;
  document.documentElement.style.setProperty(name, `${value}px`);
}

export function applyParentViewport(message: ParentViewportMessage): void {
  if (typeof document === 'undefined') return;

  document.documentElement.style.setProperty('--parent-visual-height', `${message.height}px`);
  setOptionalPixelProperty('--parent-visual-width', message.width);
  setOptionalPixelProperty('--parent-visual-offset-top', message.offsetTop);
  setOptionalPixelProperty('--parent-visual-offset-left', message.offsetLeft);
  setOptionalPixelProperty('--parent-visual-frame-top', message.frameTop);
  setOptionalPixelProperty('--parent-visual-frame-left', message.frameLeft);
  setOptionalPixelProperty('--parent-visual-page-top', message.pageTop);
  setOptionalPixelProperty('--parent-visual-page-left', message.pageLeft);
  if (message.safeArea) {
    setOptionalPixelProperty('--parent-safe-top', message.safeArea.top);
    setOptionalPixelProperty('--parent-safe-right', message.safeArea.right);
    setOptionalPixelProperty('--parent-safe-bottom', message.safeArea.bottom);
    setOptionalPixelProperty('--parent-safe-left', message.safeArea.left);
  }
}

export function initParentViewport(): void {
  if (typeof window === 'undefined' || window === window.parent || parentViewportListenerInitialized) return;
  parentViewportListenerInitialized = true;

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    if (!isParentViewportMessage(event.data)) return;
    applyParentViewport(event.data);
  });
}
