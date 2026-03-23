import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatSettingsModal } from './chat-settings-modal';
import { CHAT_STATES } from './chat-state';

vi.mock('../api-url', () => ({
  apiRequest: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ state: 'done', output: 'ok' }) }),
  getToken: vi.fn().mockReturnValue('tok'),
  buildApiUrl: vi.fn().mockReturnValue('/api/init-status'),
}));

vi.mock('../embed-config', () => ({
  shouldHideThemeSwitch: vi.fn().mockReturnValue(false),
}));

vi.mock('../theme-toggle', () => ({
  ThemeToggle: () => <button type="button" aria-label="Toggle theme">Theme</button>,
}));

vi.mock('../activity-review-panel', () => ({
  ActivityTypeFilters: () => <div data-testid="activity-filters" />,
}));

describe('ChatSettingsModal', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '1.0.0');
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <ChatSettingsModal
        open={false}
        onClose={vi.fn()}
        state={CHAT_STATES.AUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders Settings dialog when open is true', () => {
    render(
      <ChatSettingsModal
        open={true}
        onClose={vi.fn()}
        state={CHAT_STATES.AUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
      />
    );
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('shows version number', () => {
    render(
      <ChatSettingsModal
        open={true}
        onClose={vi.fn()}
        state={CHAT_STATES.AUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
      />
    );
    expect(screen.getByText('v1.0.0')).toBeTruthy();
  });

  it('calls onClose when Close button clicked', () => {
    const onClose = vi.fn();
    render(
      <ChatSettingsModal
        open={true}
        onClose={onClose}
        state={CHAT_STATES.AUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ChatSettingsModal
        open={true}
        onClose={onClose}
        state={CHAT_STATES.AUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
      />
    );
    // Click the overlay (first element)
    fireEvent.click(container.firstChild as Element);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows "Re-authenticate" button when state is AUTHENTICATED', () => {
    render(
      <ChatSettingsModal
        open={true}
        onClose={vi.fn()}
        state={CHAT_STATES.AUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /re-authenticate/i })).toBeTruthy();
  });

  it('shows "Start Auth" button when state is UNAUTHENTICATED', () => {
    render(
      <ChatSettingsModal
        open={true}
        onClose={vi.fn()}
        state={CHAT_STATES.UNAUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /start auth/i })).toBeTruthy();
  });

  it('calls onStartAuth and onClose when Start Auth clicked from UNAUTHENTICATED', () => {
    const onClose = vi.fn();
    const onStartAuth = vi.fn();
    render(
      <ChatSettingsModal
        open={true}
        onClose={onClose}
        state={CHAT_STATES.UNAUTHENTICATED}
        onStartAuth={onStartAuth}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /start auth/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onStartAuth).toHaveBeenCalled();
  });

  it('calls onReauthenticate and onClose when Re-authenticate clicked', () => {
    const onClose = vi.fn();
    const onReauthenticate = vi.fn();
    render(
      <ChatSettingsModal
        open={true}
        onClose={onClose}
        state={CHAT_STATES.AUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={onReauthenticate}
        onLogout={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /re-authenticate/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onReauthenticate).toHaveBeenCalled();
  });

  it('shows Logout button when state is AUTHENTICATED', () => {
    render(
      <ChatSettingsModal
        open={true}
        onClose={vi.fn()}
        state={CHAT_STATES.AUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /logout/i })).toBeTruthy();
  });

  it('calls onLogout and onClose when Logout clicked', () => {
    const onClose = vi.fn();
    const onLogout = vi.fn();
    render(
      <ChatSettingsModal
        open={true}
        onClose={onClose}
        state={CHAT_STATES.AUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={onLogout}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /logout/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onLogout).toHaveBeenCalled();
  });

  it('shows init status when API returns data', async () => {
    const { apiRequest } = await import('../api-url');
    vi.mocked(apiRequest).mockResolvedValue({
      ok: true,
      json: async () => ({ state: 'done', output: 'Script ran successfully', systemPrompt: 'You are helpful' }),
    } as Response);

    render(
      <ChatSettingsModal
        open={true}
        onClose={vi.fn()}
        state={CHAT_STATES.AUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Post-init script')).toBeTruthy();
    });
  });

  it('shows "Running…" status when state is running', async () => {
    const { apiRequest } = await import('../api-url');
    vi.mocked(apiRequest).mockResolvedValue({
      ok: true,
      json: async () => ({ state: 'running' }),
    } as Response);

    render(
      <ChatSettingsModal
        open={true}
        onClose={vi.fn()}
        state={CHAT_STATES.AUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Running…')).toBeTruthy();
    });
  });

  it('shows failed status when state is failed', async () => {
    const { apiRequest } = await import('../api-url');
    vi.mocked(apiRequest).mockResolvedValue({
      ok: true,
      json: async () => ({ state: 'failed', error: 'Oops' }),
    } as Response);

    render(
      <ChatSettingsModal
        open={true}
        onClose={vi.fn()}
        state={CHAT_STATES.AUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeTruthy();
    });
  });

  it('does not render auth buttons when state is ERROR', () => {
    render(
      <ChatSettingsModal
        open={true}
        onClose={vi.fn()}
        state={CHAT_STATES.ERROR}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /start auth|re-authenticate|logout/i })).toBeNull();
  });

  it('shows Logout button when state is AWAITING_RESPONSE', () => {
    render(
      <ChatSettingsModal
        open={true}
        onClose={vi.fn()}
        state={CHAT_STATES.AWAITING_RESPONSE}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /logout/i })).toBeTruthy();
  });
});
