import { useState, useRef, useCallback, useEffect } from 'react';

export interface UsePanelResizeOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  storageKey: string;
  /** 'left' → dragging rightward grows the panel; 'right' → dragging leftward grows. */
  side: 'left' | 'right';
}

export interface UsePanelResizeResult {
  /** React-state width — use for the initial inline style only. */
  width: number;
  isDragging: boolean;
  startResize: (e: PanelResizeStartEvent) => void;
  /**
   * Attach this ref to the panel's root DOM element.
   * During drag the hook mutates `style.width` directly — no React re-renders.
   */
  panelRef: React.RefObject<HTMLDivElement | null>;
}

export type PanelResizeStartEvent = React.PointerEvent | React.MouseEvent | React.TouchEvent;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readPersistedWidth(storageKey: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function persistWidth(storageKey: string, width: number): void {
  try {
    localStorage.setItem(storageKey, String(width));
  } catch {
    /* ignore */
  }
}

function clientXFromEvent(event: PanelResizeStartEvent | MouseEvent | PointerEvent | TouchEvent): number | null {
  if ('touches' in event && event.touches.length > 0) return event.touches[0]?.clientX ?? null;
  if ('changedTouches' in event && event.changedTouches.length > 0) return event.changedTouches[0]?.clientX ?? null;
  return 'clientX' in event ? event.clientX : null;
}

function resizeEventType(event: PanelResizeStartEvent): 'pointer' | 'mouse' | 'touch' {
  if ('touches' in event) return 'touch';
  if (typeof window !== 'undefined' && 'PointerEvent' in window) return 'pointer';
  return 'mouse';
}

export function usePanelResize({
  initialWidth,
  minWidth,
  maxWidth,
  storageKey,
  side,
}: UsePanelResizeOptions): UsePanelResizeResult {
  const [width, setWidth] = useState<number>(() =>
    clamp(readPersistedWidth(storageKey, initialWidth), minWidth, maxWidth)
  );
  const [isDragging, setIsDragging] = useState(false);

  // Tracks current width without causing re-renders
  const widthRef = useRef(width);
  // Direct reference to the panel DOM element
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Keep widthRef in sync with React state (handles external state changes)
  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const startResize = useCallback(
    (e: PanelResizeStartEvent) => {
      e.preventDefault();

      const startX = clientXFromEvent(e);
      if (startX === null) return;

      const startWidth = widthRef.current;
      const el = panelRef.current;
      const eventType = resizeEventType(e);

      // Disable transition immediately via inline style — bypasses the CSS class
      if (el) {
        el.style.transition = 'none';
        el.style.willChange = 'width';
      }

      // One React state update to disable CSS transitions and show cursor
      setIsDragging(true);

      const onMove = (event: Event) => {
        const clientX = clientXFromEvent(event as MouseEvent | PointerEvent | TouchEvent);
        if (clientX === null) return;
        event.preventDefault();
        const delta = clientX - startX;
        const next = clamp(
          startWidth + (side === 'left' ? delta : -delta),
          minWidth,
          maxWidth
        );
        widthRef.current = next;

        // Direct DOM mutation — zero React re-renders during drag
        if (el) {
          el.style.width = `${next}px`;
        }
      };

      const onUp = (event: Event) => {
        const clientX = clientXFromEvent(event as MouseEvent | PointerEvent | TouchEvent) ?? startX;
        const delta = clientX - startX;
        const finalWidth = clamp(
          startWidth + (side === 'left' ? delta : -delta),
          minWidth,
          maxWidth
        );
        widthRef.current = finalWidth;

        // Re-enable transitions
        if (el) {
          el.style.transition = '';
          el.style.willChange = '';
        }

        // Sync React state once at the end — only 1 re-render for the whole drag
        setWidth(finalWidth);
        persistWidth(storageKey, finalWidth);
        setIsDragging(false);

        removeDocumentListeners();
      };

      const removeDocumentListeners = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        document.removeEventListener('touchcancel', onUp);
      };

      if (eventType === 'pointer') {
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      } else if (eventType === 'touch') {
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
        document.addEventListener('touchcancel', onUp);
      } else {
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      }
    },
    [minWidth, maxWidth, storageKey, side]
  );

  return { width, isDragging, startResize, panelRef };
}
