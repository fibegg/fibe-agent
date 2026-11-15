import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useScrollToBottom } from './use-scroll-to-bottom';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each([true, false])(
  'preserves bottom pin=%s when the keyboard shrinks the message viewport',
  (pinned) => {
    let resize: () => void = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    let height = 600;
    const scrollTo = vi.fn();
    function Chat() {
      const chat = useScrollToBottom('stable', 1);
      return (
        <div
          ref={(element) => {
            chat.scrollRef.current = element;
            if (element)
              Object.defineProperties(element, {
                clientHeight: { configurable: true, get: () => height },
                clientWidth: { configurable: true, value: 390 },
                scrollHeight: { configurable: true, value: 1200 },
                scrollTop: {
                  configurable: true,
                  writable: true,
                  value: pinned ? 600 : 100,
                },
                scrollTo: { configurable: true, value: scrollTo },
              });
          }}
          onScroll={chat.onScroll}
          data-testid="messages"
        />
      );
    }
    const view = render(<Chat />);
    act(() => view.getByTestId('messages').dispatchEvent(new Event('scroll')));
    height = 300;
    act(() => {
      view.getByTestId('messages').dispatchEvent(new Event('scroll'));
      resize();
    });
    if (pinned)
      expect(scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: 'instant' });
    else expect(scrollTo).not.toHaveBeenCalled();
  },
);
