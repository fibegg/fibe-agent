import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivitySettingsModal, type ActivitySettingsModalProps } from './activity-settings-modal';

vi.mock('./theme-toggle', () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Toggle</button>,
}));

vi.mock('./embed-config', () => ({
  shouldHideThemeSwitch: vi.fn().mockReturnValue(false),
}));

vi.mock('./activity-type-filters', () => ({
  ActivityTypeFilters: ({ onTypeFilterChange }: { typeFilter: string[]; onTypeFilterChange: (f: string[]) => void }) => (
    <div data-testid="activity-type-filters">
      <button onClick={() => onTypeFilterChange(['tool_call'])}>Apply filter</button>
    </div>
  ),
}));

describe('ActivitySettingsModal', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '1.2.3');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function renderModal(props: Partial<ActivitySettingsModalProps> = {}) {
    const defaultProps: ActivitySettingsModalProps = {
      open: true,
      onClose: vi.fn(),
    };
    return render(<ActivitySettingsModal {...defaultProps} {...props} />);
  }

  it('renders nothing when closed', () => {
    const { container } = renderModal({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders when open', () => {
    renderModal({ open: true });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    // The backdrop has aria-hidden and onClick=onClose
    const backdrop = document.querySelector('[aria-hidden="true"]');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stops propagation when dialog content is clicked', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows ActivityTypeFilters when onTypeFilterChange is provided', () => {
    const onTypeFilterChange = vi.fn();
    renderModal({ onTypeFilterChange, typeFilter: [] });
    expect(screen.getByTestId('activity-type-filters')).toBeTruthy();
    expect(screen.getByText('Activity Filter')).toBeTruthy();
  });

  it('does not show ActivityTypeFilters when onTypeFilterChange is not provided', () => {
    renderModal();
    expect(screen.queryByTestId('activity-type-filters')).toBeNull();
  });

  it('shows the theme toggle when shouldHideThemeSwitch returns false', async () => {
    const { shouldHideThemeSwitch } = await import('./embed-config');
    vi.mocked(shouldHideThemeSwitch).mockReturnValue(false);
    renderModal();
    expect(screen.getByTestId('theme-toggle')).toBeTruthy();
    expect(screen.getByText('Dark mode')).toBeTruthy();
  });

  it('hides the theme toggle when shouldHideThemeSwitch returns true', async () => {
    const { shouldHideThemeSwitch } = await import('./embed-config');
    vi.mocked(shouldHideThemeSwitch).mockReturnValue(true);
    renderModal();
    expect(screen.queryByTestId('theme-toggle')).toBeNull();
  });

  it('displays the app version', () => {
    renderModal();
    expect(screen.getByText(`v1.2.3`)).toBeTruthy();
  });

  it('calls onTypeFilterChange when filter is changed', () => {
    const onTypeFilterChange = vi.fn();
    renderModal({ onTypeFilterChange, typeFilter: [] });
    fireEvent.click(screen.getByText('Apply filter'));
    expect(onTypeFilterChange).toHaveBeenCalledWith(['tool_call']);
  });

  it('uses aria-labelledby to reference title', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBe('activity-settings-dialog-title');
    expect(screen.getByText('Settings').id).toBe('activity-settings-dialog-title');
  });
});
