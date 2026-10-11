import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeSelector } from './theme-selector';
import * as themeModule from './theme';

describe('ThemeSelector', () => {
  beforeEach(() => {
    vi.spyOn(themeModule, 'getEffectiveTheme').mockReturnValue('dark');
    vi.spyOn(themeModule, 'setStoredTheme').mockImplementation(() => undefined);
    vi.spyOn(themeModule, 'onThemeChanged').mockReturnValue(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders exactly Light and Dark options', () => {
    render(<ThemeSelector />);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'Light' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeTruthy();
  });

  it('marks the active theme', () => {
    render(<ThemeSelector />);
    expect(
      screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('stores the selected theme', () => {
    render(<ThemeSelector />);
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(themeModule.setStoredTheme).toHaveBeenCalledWith('light');
  });
});
