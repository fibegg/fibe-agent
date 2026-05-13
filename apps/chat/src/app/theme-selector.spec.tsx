import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeSelector } from './theme-selector';
import * as themeModule from './theme';

describe('ThemeSelector', () => {
  beforeEach(() => {
    vi.spyOn(themeModule, 'getEffectiveTheme').mockReturnValue('dracula');
    vi.spyOn(themeModule, 'setStoredTheme').mockImplementation(() => undefined);
    vi.spyOn(themeModule, 'onThemeChanged').mockReturnValue(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all theme options', () => {
    render(<ThemeSelector />);
    expect(screen.getByRole('radio', { name: 'Fibe Light' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Fibe Dark' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Dracula' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Midnight' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'High Contrast' })).toBeTruthy();
  });

  it('marks the active theme', () => {
    render(<ThemeSelector />);
    expect(screen.getByRole('radio', { name: 'Dracula' }).getAttribute('aria-checked')).toBe('true');
  });

  it('stores the selected theme', () => {
    render(<ThemeSelector />);
    fireEvent.click(screen.getByRole('radio', { name: 'Midnight' }));
    expect(themeModule.setStoredTheme).toHaveBeenCalledWith('midnight');
  });
});
