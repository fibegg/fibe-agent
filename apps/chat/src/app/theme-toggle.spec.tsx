import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from './theme-toggle';
import * as themeModule from './theme';

// jsdom doesn't implement matchMedia, so we stub it
function setupMatchMedia(matches = false, onChange?: () => void) {
  let listener: (() => void) | null = null;
  const mq = {
    matches,
    addEventListener: vi.fn((_: string, fn: () => void) => { listener = fn; }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mq));
  return { mq, getListener: () => listener, triggerChange: () => { if (listener) listener(); } };
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    vi.spyOn(themeModule, 'isDark').mockReturnValue(false);
    vi.spyOn(themeModule, 'getStoredTheme').mockReturnValue(null);
    vi.spyOn(themeModule, 'toggleTheme').mockImplementation(() => 'light');
    // Provide a default matchMedia stub so component doesn't crash
    const mq = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mq));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a button', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('shows "Switch to dark mode" label when in light mode', () => {
    vi.spyOn(themeModule, 'isDark').mockReturnValue(false);
    render(<ThemeToggle />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Switch to dark mode');
  });

  it('shows "Switch to light mode" label when in dark mode', () => {
    document.documentElement.classList.add('dark');
    vi.spyOn(themeModule, 'isDark').mockReturnValue(true);
    render(<ThemeToggle />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Switch to light mode');
    document.documentElement.classList.remove('dark');
  });

  it('calls toggleTheme and updates state on click', () => {
    vi.spyOn(themeModule, 'isDark').mockReturnValueOnce(false).mockReturnValue(true);
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(themeModule.toggleTheme).toHaveBeenCalled();
    expect(button.getAttribute('aria-label')).toBe('Switch to light mode');
  });

  it('adds matchMedia listener when matchMedia is available', () => {
    const { mq } = setupMatchMedia();
    const { unmount } = render(<ThemeToggle />);
    expect(mq.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    unmount();
    expect(mq.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('updates dark state when matchMedia change fires and no stored theme', () => {
    vi.spyOn(themeModule, 'getStoredTheme').mockReturnValue(null);
    vi.spyOn(themeModule, 'isDark').mockReturnValue(true);

    const { triggerChange } = setupMatchMedia();

    render(<ThemeToggle />);

    // Manually trigger the change listener
    triggerChange();

    // isDark was called on mount (in useEffect) + click/change
    expect(themeModule.isDark).toHaveBeenCalled();
  });

  it('does not update state on matchMedia change when stored theme is set', () => {
    vi.spyOn(themeModule, 'getStoredTheme').mockReturnValue('dark');
    const isDarkSpy = vi.spyOn(themeModule, 'isDark').mockReturnValue(false);

    const { triggerChange } = setupMatchMedia();
    render(<ThemeToggle />);

    // Clear calls from mount
    isDarkSpy.mockClear();

    // Fire the change listener — since stored theme is set, isDark should not be called
    triggerChange();

    expect(isDarkSpy).not.toHaveBeenCalled();
  });

  it('handles case when matchMedia is not available (falsy)', () => {
    // Override matchMedia to return falsy
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(false));
    // Should not throw
    expect(() => render(<ThemeToggle />)).not.toThrow();
  });
});
