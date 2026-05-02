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
  getLocaleSource: vi.fn().mockReturnValue('localStorage'),
  shouldHideLocaleSelector: vi.fn().mockReturnValue(false),
  shouldHideThemeSwitch: vi.fn().mockReturnValue(false),
}));

vi.mock('../theme-toggle', () => ({
  ThemeToggle: () => <button type="button" aria-label="Toggle theme">Theme</button>,
}));

vi.mock('../activity-type-filters', () => ({
  ActivityTypeFilters: () => <div data-testid="activity-filters" />,
}));

describe('ChatSettingsModal', () => {
  beforeEach(async () => {
    vi.stubGlobal('__APP_VERSION__', '1.0.0');
    const { apiRequest } = await import('../api-url');
    vi.mocked(apiRequest).mockResolvedValue({
      ok: true,
      json: async () => ({ state: 'done', output: 'ok' }),
    } as Response);
    localStorage.clear();
    document.documentElement.removeAttribute('data-ui-effects');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.removeAttribute('data-ui-effects');
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

  it('renders Simplicate switch and calls onSimplicateModeChange', () => {
    const onSimplicateModeChange = vi.fn();
    render(
      <ChatSettingsModal
        open={true}
        onClose={vi.fn()}
        state={CHAT_STATES.AUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
        simplicateMode={false}
        onSimplicateModeChange={onSimplicateModeChange}
      />
    );

    const toggle = screen.getByRole('switch', { name: /simplicate/i });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(onSimplicateModeChange).toHaveBeenCalledWith(true);
  });

  it('hides Simplicate switch in settings when compact mode already exposes it in the actions menu', () => {
    render(
      <ChatSettingsModal
        open={true}
        onClose={vi.fn()}
        state={CHAT_STATES.AUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
        simplicateMode
        onSimplicateModeChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('switch', { name: /simplicate/i })).toBeNull();
  });

  it('renders UI effects switch and persists reduced mode', () => {
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

    const toggle = screen.getByRole('switch', { name: /animations and visual effects/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(localStorage.getItem('chat-ui-effects-enabled')).toBe('false');
    expect(document.documentElement.dataset.uiEffects).toBe('reduced');
  });

  it('does not render model or effort controls in settings', () => {
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

    expect(screen.queryByText('Model')).toBeNull();
    expect(screen.queryByText('Claude Effort')).toBeNull();
  });

  it('runs reset only after confirmation click', () => {
    const onResetConversation = vi.fn();
    render(
      <ChatSettingsModal
        open={true}
        onClose={vi.fn()}
        state={CHAT_STATES.AUTHENTICATED}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
        onResetConversation={onResetConversation}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /reset conversation/i }));
    expect(onResetConversation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirm reset/i }));
    expect(onResetConversation).toHaveBeenCalledTimes(1);
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

  it('hides standalone-only controls when rendered from Rails', () => {
    render(
      <ChatSettingsModal
        open={true}
        onClose={vi.fn()}
        state={CHAT_STATES.AUTHENTICATED}
        isStandalone={false}
        onStartAuth={vi.fn()}
        onReauthenticate={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    expect(screen.queryByText(/data privacy/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /re-authenticate/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /logout/i })).toBeNull();
    expect(screen.queryByText(/post-init script/i)).toBeNull();
    expect(screen.queryByText(/system_prompt/i)).toBeNull();
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

  it('handleExportData calls apiRequest for export and creates object URL', async () => {
    const { apiRequest } = await import('../api-url');
    const fakeBlob = new Blob(['{}'], { type: 'application/json' });
    vi.mocked(apiRequest).mockResolvedValue({
      ok: true,
      blob: async () => fakeBlob,
      json: async () => ({ state: 'done' }),
    } as unknown as Response);

    const createObjectURL = vi.fn().mockReturnValue('blob:fake');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis, 'URL', {
      writable: true,
      value: { createObjectURL, revokeObjectURL },
    });

    // Sub document.createElement to avoid real navigation
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'a') {
        const a = originalCreateElement('a');
        a.click = clickSpy;
        return a;
      }
      return originalCreateElement(tagName);
    });

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

    fireEvent.click(screen.getByRole('button', { name: /export my data/i }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(fakeBlob));
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();

    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'URL', { writable: true, value: window.URL ?? URL });
  });

  it('handleDeleteData does nothing when user cancels confirm', async () => {
    const { apiRequest } = await import('../api-url');
    vi.mocked(apiRequest).mockResolvedValue({
      ok: true,
      json: async () => ({ state: 'done' }),
    } as Response);
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));

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

    fireEvent.click(screen.getByRole('button', { name: /delete my data/i }));
    const calls = vi.mocked(apiRequest).mock.calls;
    const deleteCalls = calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE');
    expect(deleteCalls.length).toBe(0);
    vi.unstubAllGlobals();
    vi.stubGlobal('__APP_VERSION__', '1.0.0');
  });

  it('handleDeleteData calls DELETE when user confirms', async () => {
    const { apiRequest } = await import('../api-url');
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    let deleteCallMade = false;
    vi.mocked(apiRequest).mockImplementation(async (path: string, opts?: RequestInit) => {
      if ((opts as RequestInit | undefined)?.method === 'DELETE') {
        deleteCallMade = true;
        return { ok: true } as Response;
      }
      return { ok: true, json: async () => ({ state: 'done' }) } as Response;
    });

    // Suppress jsdom "not implemented navigation" error for location.reload
    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    // @ts-expect-error jsdom bypass
    delete window.location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.location = { ...originalLocation, reload: reloadSpy } as any;

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

    fireEvent.click(screen.getByRole('button', { name: /delete my data/i }));
    await waitFor(() => expect(deleteCallMade).toBe(true));
    expect(reloadSpy).toHaveBeenCalled();

    // Restore
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.location = originalLocation as any;
    vi.unstubAllGlobals();
    vi.stubGlobal('__APP_VERSION__', '1.0.0');
  });
});
