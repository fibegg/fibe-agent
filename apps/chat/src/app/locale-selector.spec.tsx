import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from './i18n';
import { LocaleSelector } from './locale-selector';

vi.mock('./embed-config', () => ({
  shouldHideLocaleSelector: vi.fn().mockReturnValue(false),
}));

function renderSelector(variant?: 'icon' | 'stark') {
  return render(
    <I18nProvider>
      <div data-testid="host">
        <LocaleSelector variant={variant} />
      </div>
    </I18nProvider>,
  );
}

describe('LocaleSelector', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
    vi.clearAllMocks();
  });

  it('renders the icon dropdown in a portal so app layout cannot clip it', async () => {
    renderSelector();

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));

    const menu = await screen.findByRole('menu', { name: /select language/i });
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.position).toBe('fixed');
    expect(screen.getByRole('menuitemradio', { name: /english/i })).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: /українська/i })).toBeTruthy();
  });

  it('closes the portal dropdown on outside pointer down', async () => {
    renderSelector();

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));
    expect(await screen.findByRole('menu', { name: /select language/i })).toBeTruthy();

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: /select language/i })).toBeNull();
    });
  });

  it('keeps Stark mode as a dropdown with Stark styling', async () => {
    renderSelector('stark');

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));

    const menu = await screen.findByRole('menu', { name: /select language/i });
    expect(menu.parentElement).toBe(document.body);
    expect(menu.className).toContain('border-cyan-500/60');
    expect(screen.getByRole('menuitemradio', { name: /english/i })).toBeTruthy();
  });
});
