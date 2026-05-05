export interface ParentViewportMessage {
  type: 'viewport';
  height: number;
  width?: number;
  offsetTop?: number;
  offsetLeft?: number;
  pageTop?: number;
  pageLeft?: number;
}

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
    isOptionalScrollNumber(o.pageTop) &&
    isOptionalScrollNumber(o.pageLeft)
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
  setOptionalPixelProperty('--parent-visual-page-top', message.pageTop);
  setOptionalPixelProperty('--parent-visual-page-left', message.pageLeft);
}

export function initParentViewport(): void {
  if (typeof window === 'undefined' || window === window.parent || parentViewportListenerInitialized) return;
  parentViewportListenerInitialized = true;

  window.addEventListener('message', (event: MessageEvent) => {
    if (!isParentViewportMessage(event.data)) return;
    applyParentViewport(event.data);
  });
}
