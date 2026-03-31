import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePanelResize } from './use-panel-resize';

const OPTIONS = {
  initialWidth: 280,
  minWidth: 100,
  maxWidth: 500,
  storageKey: 'test-width',
  side: 'left' as const,
};

// jsdom doesn't polyfill PointerEvent — stub it once.
class PointerEventStub extends MouseEvent {
  constructor(type: string, init?: PointerEventInit) {
    super(type, { bubbles: true, ...init });
  }
}

function makePointerEvent(type: string, clientX: number): Event {
  return new PointerEventStub(type, { clientX });
}

describe('usePanelResize', () => {
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', PointerEventStub);
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initialises with initialWidth when nothing is stored', () => {
    const { result } = renderHook(() => usePanelResize(OPTIONS));
    expect(result.current.width).toBe(280);
    expect(result.current.isDragging).toBe(false);
  });

  it('reads persisted width from localStorage on mount', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('360');
    const { result } = renderHook(() => usePanelResize(OPTIONS));
    expect(result.current.width).toBe(360);
  });

  it('clamps persisted width to [minWidth, maxWidth]', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('9999');
    const { result } = renderHook(() => usePanelResize(OPTIONS));
    expect(result.current.width).toBe(500);
  });

  it('falls back to initialWidth when stored value is non-numeric', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('bad');
    const { result } = renderHook(() => usePanelResize(OPTIONS));
    expect(result.current.width).toBe(280);
  });

  it('falls back to initialWidth when localStorage throws', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('unavailable');
    });
    const { result } = renderHook(() => usePanelResize(OPTIONS));
    expect(result.current.width).toBe(280);
  });

  it('exposes a panelRef for DOM attachment', () => {
    const { result } = renderHook(() => usePanelResize(OPTIONS));
    expect(result.current.panelRef).toBeDefined();
    expect(typeof result.current.panelRef).toBe('object');
  });

  it('sets isDragging true on startResize and false after pointerup', () => {
    const { result } = renderHook(() => usePanelResize(OPTIONS));

    const fakeEvent = {
      preventDefault: vi.fn(),
      clientX: 100,
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.startResize(fakeEvent);
    });

    expect(result.current.isDragging).toBe(true);

    act(() => {
      document.dispatchEvent(makePointerEvent('pointerup', 100));
    });

    expect(result.current.isDragging).toBe(false);
  });

  it('directly mutates panelRef.current.style.width on pointermove (side=left)', () => {
    const { result } = renderHook(() => usePanelResize(OPTIONS));

    // Attach a real DOM element so direct mutation can be observed
    const el = document.createElement('div');
    (result.current.panelRef as React.MutableRefObject<HTMLDivElement>).current = el;

    const fakeEvent = {
      preventDefault: vi.fn(),
      clientX: 200,
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.startResize(fakeEvent);
    });

    // drag 50px to the right → width = 280 + 50 = 330
    act(() => {
      document.dispatchEvent(makePointerEvent('pointermove', 250));
    });

    expect(el.style.width).toBe('330px');
    // React state is NOT updated during drag
    expect(result.current.width).toBe(280);
  });

  it('directly mutates panelRef.current.style.width on pointermove (side=right)', () => {
    const { result } = renderHook(() => usePanelResize({ ...OPTIONS, side: 'right' }));

    const el = document.createElement('div');
    (result.current.panelRef as React.MutableRefObject<HTMLDivElement>).current = el;

    const fakeEvent = {
      preventDefault: vi.fn(),
      clientX: 200,
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.startResize(fakeEvent);
    });

    // drag 50px to the left (200→150) → width = 280 + 50 = 330
    act(() => {
      document.dispatchEvent(makePointerEvent('pointermove', 150));
    });

    expect(el.style.width).toBe('330px');
  });

  it('clamps DOM width to minWidth on drag', () => {
    const { result } = renderHook(() => usePanelResize(OPTIONS));

    const el = document.createElement('div');
    (result.current.panelRef as React.MutableRefObject<HTMLDivElement>).current = el;

    const fakeEvent = {
      preventDefault: vi.fn(),
      clientX: 200,
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.startResize(fakeEvent);
    });

    act(() => {
      document.dispatchEvent(makePointerEvent('pointermove', 0));
    });

    expect(el.style.width).toBe('100px');
  });

  it('clamps DOM width to maxWidth on drag', () => {
    const { result } = renderHook(() => usePanelResize(OPTIONS));

    const el = document.createElement('div');
    (result.current.panelRef as React.MutableRefObject<HTMLDivElement>).current = el;

    const fakeEvent = {
      preventDefault: vi.fn(),
      clientX: 200,
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.startResize(fakeEvent);
    });

    act(() => {
      document.dispatchEvent(makePointerEvent('pointermove', 9999));
    });

    expect(el.style.width).toBe('500px');
  });

  it('updates React state width only on pointerup', () => {
    const { result } = renderHook(() => usePanelResize(OPTIONS));

    const el = document.createElement('div');
    (result.current.panelRef as React.MutableRefObject<HTMLDivElement>).current = el;

    const fakeEvent = {
      preventDefault: vi.fn(),
      clientX: 200,
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.startResize(fakeEvent);
    });

    // Move during drag — React state should NOT change yet
    act(() => {
      document.dispatchEvent(makePointerEvent('pointermove', 250));
    });
    expect(result.current.width).toBe(280);

    // Release — React state updates to final width
    act(() => {
      document.dispatchEvent(makePointerEvent('pointerup', 300));
    });
    expect(result.current.width).toBe(380);
  });

  it('persists width to localStorage on pointerup', () => {
    const { result } = renderHook(() => usePanelResize(OPTIONS));

    const fakeEvent = {
      preventDefault: vi.fn(),
      clientX: 200,
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.startResize(fakeEvent);
    });

    act(() => {
      document.dispatchEvent(makePointerEvent('pointerup', 300));
    });

    expect(localStorage.setItem).toHaveBeenCalledWith('test-width', '380');
  });

  it('does not throw when localStorage.setItem throws on persist', () => {
    (localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('quota');
    });
    const { result } = renderHook(() => usePanelResize(OPTIONS));

    const fakeEvent = {
      preventDefault: vi.fn(),
      clientX: 200,
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.startResize(fakeEvent);
    });

    expect(() => {
      act(() => {
        document.dispatchEvent(makePointerEvent('pointerup', 300));
      });
    }).not.toThrow();
  });

  it('does not throw when panelRef is not attached', () => {
    const { result } = renderHook(() => usePanelResize(OPTIONS));

    const fakeEvent = {
      preventDefault: vi.fn(),
      clientX: 200,
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.startResize(fakeEvent);
    });

    expect(() => {
      act(() => {
        document.dispatchEvent(makePointerEvent('pointermove', 250));
      });
    }).not.toThrow();
  });
});
