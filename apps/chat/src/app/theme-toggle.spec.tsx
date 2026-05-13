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
    vi.spyOn(themeModule, 'getEffectiveTheme').mockReturnValue('light');
    vi.spyOn(themeModule, 'getStoredTheme').mockReturnValue(null);
    vi.spyOn(themeModule, 'toggleTheme').mockImplementation(() => 'dark');
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

  it('shows switch theme label', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Switch theme');
  });

  it('shows current theme title', () => {
    vi.spyOn(themeModule, 'getEffectiveTheme').mockReturnValue('dracula');
    render(<ThemeToggle />);
    expect(screen.getByRole('button').getAttribute('title')).toBe('Current theme: Dracula');
  });

  it('calls toggleTheme and updates state on click', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(themeModule.toggleTheme).toHaveBeenCalled();
    expect(button.getAttribute('title')).toBe('Current theme: Fibe Dark');
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
    const getEffectiveThemeSpy = vi.spyOn(themeModule, 'getEffectiveTheme').mockReturnValue('dark');

    const { triggerChange } = setupMatchMedia();

    render(<ThemeToggle />);

    // Manually trigger the change listener
    triggerChange();

    expect(getEffectiveThemeSpy).toHaveBeenCalled();
  });

  it('does not update state on matchMedia change when stored theme is set', () => {
    vi.spyOn(themeModule, 'getStoredTheme').mockReturnValue('dark');
    const getEffectiveThemeSpy = vi.spyOn(themeModule, 'getEffectiveTheme').mockReturnValue('dark');

    const { triggerChange } = setupMatchMedia();
    render(<ThemeToggle />);

    getEffectiveThemeSpy.mockClear();

    triggerChange();

    expect(getEffectiveThemeSpy).not.toHaveBeenCalled();
  });

  it('handles case when matchMedia is not available (falsy)', () => {
    // Override matchMedia to return falsy
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(false));
    // Should not throw
    expect(() => render(<ThemeToggle />)).not.toThrow();
  });
});
