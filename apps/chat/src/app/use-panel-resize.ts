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
  startResize: (e: React.PointerEvent) => void;
  /**
   * Attach this ref to the panel's root DOM element.
   * During drag the hook mutates `style.width` directly — no React re-renders.
   */
  panelRef: React.RefObject<HTMLDivElement | null>;
}

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
    (e: React.PointerEvent) => {
      e.preventDefault();

      const startX = e.clientX;
      const startWidth = widthRef.current;
      const el = panelRef.current;

      // Disable transition immediately via inline style — bypasses the CSS class
      if (el) {
        el.style.transition = 'none';
        el.style.willChange = 'width';
      }

      // One React state update to disable CSS transitions and show cursor
      setIsDragging(true);

      const onMove = (event: PointerEvent) => {
        const delta = event.clientX - startX;
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

      const onUp = (event: PointerEvent) => {
        const delta = event.clientX - startX;
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

        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [minWidth, maxWidth, storageKey, side]
  );

  return { width, isDragging, startResize, panelRef };
}
