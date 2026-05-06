import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChatHeader } from './chat-header';
import { CHAT_STATES } from './chat-state';

vi.mock('./model-selector', () => ({
  ModelSelector: ({ currentModel, visible }: { currentModel: string; visible: boolean }) =>
    visible ? <div data-testid="model-selector">{currentModel}</div> : null,
}));

const DEFAULT_PROPS = {
  isMobile: false,
  state: CHAT_STATES.AUTHENTICATED,
  errorMessage: null,
  sessionTimeMs: 0,
  mobileSessionStats: { totalActions: 0, completed: 0, processing: 0 },
  sessionTokenUsage: null,
  mobileBrainClasses: { brain: 'text-violet-500', accent: 'text-violet-400' },
  statusClass: 'text-green-500',
  searchQuery: '',
  filteredMessagesCount: 0,
  onSearchChange: vi.fn(),
  onReconnect: vi.fn(),
  onStartAuth: vi.fn(),
  onOpenMenu: vi.fn(),
  onOpenActivity: vi.fn(),
  simplicateMode: false,
};

// ─── Core rendering ───────────────────────────────────────────────────────────

describe('ChatHeader', () => {
  it('shows agent provider label as heading when agentName is not provided', () => {
    render(<ChatHeader {...DEFAULT_PROPS} agentProviderLabel="Claude" />);
    expect(screen.getByText('Claude')).toBeTruthy();
  });

  it('shows current model as muted secondary text beside provider label', () => {
    render(<ChatHeader {...DEFAULT_PROPS} agentProviderLabel="Claude" currentModel="haiku" />);
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.getByText('haiku')).toBeTruthy();
    expect(screen.getByTitle('Model: haiku')).toBeTruthy();
  });

  it('shows agentName as heading when provided', () => {
    render(<ChatHeader {...DEFAULT_PROPS} agentName="My Agent" agentProviderLabel="Claude" />);
    expect(screen.getByText('My Agent')).toBeTruthy();
    expect(screen.queryByText('Claude')).toBeNull();
  });

  it('falls back to "Claude" when no provider label is available', () => {
    render(<ChatHeader {...DEFAULT_PROPS} />);
    expect(screen.getByText('Claude')).toBeTruthy();
  });

  it('heading has title attribute for truncation tooltip', () => {
    render(<ChatHeader {...DEFAULT_PROPS} agentProviderLabel="Claude" />);
    expect(screen.getByTitle('Claude')).toBeTruthy();
  });

  it('shows session time when sessionTimeMs > 0', () => {
    render(<ChatHeader {...DEFAULT_PROPS} sessionTimeMs={65000} />);
    const timer = screen.getByTitle('Session time');
    expect(timer).toBeTruthy();
    expect(timer.parentElement?.textContent).toContain('Ready');
  });

  it('shows state label for AUTHENTICATED', () => {
    render(<ChatHeader {...DEFAULT_PROPS} state={CHAT_STATES.AUTHENTICATED} />);
    expect(screen.getByText('Ready')).toBeTruthy();
  });

  // ─── Reconnect / Auth buttons ──────────────────────────────────────────────

  it('shows Reconnect button when state is AGENT_OFFLINE', () => {
    render(<ChatHeader {...DEFAULT_PROPS} state={CHAT_STATES.AGENT_OFFLINE} simplicateMode />);
    const reconnect = screen.getByRole('button', { name: /reconnect/i });
    const moreActions = screen.getByRole('button', { name: /more actions/i });
    expect(reconnect).toBeTruthy();
    expect(reconnect.parentElement?.contains(moreActions)).toBe(true);
  });

  it('calls onReconnect when Reconnect button clicked', () => {
    const onReconnect = vi.fn();
    render(<ChatHeader {...DEFAULT_PROPS} state={CHAT_STATES.AGENT_OFFLINE} onReconnect={onReconnect} />);
    fireEvent.click(screen.getByRole('button', { name: /reconnect/i }));
    expect(onReconnect).toHaveBeenCalled();
  });

  it('shows Reconnect button when state is ERROR', () => {
    render(<ChatHeader {...DEFAULT_PROPS} state={CHAT_STATES.ERROR} />);
    expect(screen.getByRole('button', { name: /reconnect/i })).toBeTruthy();
  });

  it('shows Start Auth button when state is UNAUTHENTICATED', () => {
    render(<ChatHeader {...DEFAULT_PROPS} state={CHAT_STATES.UNAUTHENTICATED} simplicateMode />);
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.getByRole('menuitem', { name: /start auth/i })).toBeTruthy();
  });

  it('calls onStartAuth when Start Auth clicked', () => {
    const onStartAuth = vi.fn();
    render(<ChatHeader {...DEFAULT_PROPS} state={CHAT_STATES.UNAUTHENTICATED} onStartAuth={onStartAuth} simplicateMode />);
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /start auth/i }));
    expect(onStartAuth).toHaveBeenCalled();
  });

  // ─── Search ────────────────────────────────────────────────────────────────

  it('renders search input', () => {
    render(<ChatHeader {...DEFAULT_PROPS} />);
    expect(screen.getByPlaceholderText(/search in conversation/i)).toBeTruthy();
  });

  it('calls onSearchChange when typing in search', () => {
    const onSearchChange = vi.fn();
    render(<ChatHeader {...DEFAULT_PROPS} onSearchChange={onSearchChange} />);
    fireEvent.change(screen.getByPlaceholderText(/search in conversation/i), { target: { value: 'hello' } });
    expect(onSearchChange).toHaveBeenCalledWith('hello');
  });

  it('shows result count when searchQuery is set', () => {
    render(<ChatHeader {...DEFAULT_PROPS} searchQuery="hello" filteredMessagesCount={3} />);
    expect(screen.getByText(/found 3 messages/i)).toBeTruthy();
  });

  it('shows singular "message" for 1 result', () => {
    render(<ChatHeader {...DEFAULT_PROPS} searchQuery="test" filteredMessagesCount={1} />);
    expect(screen.getByText(/found 1 message/i)).toBeTruthy();
  });

  it('shows clear search button when searchQuery is set', () => {
    render(<ChatHeader {...DEFAULT_PROPS} searchQuery="hello" />);
    expect(screen.getByRole('button', { name: /clear search/i })).toBeTruthy();
  });

  it('calls onSearchChange with empty string when clear button clicked', () => {
    const onSearchChange = vi.fn();
    render(<ChatHeader {...DEFAULT_PROPS} searchQuery="hello" onSearchChange={onSearchChange} />);
    fireEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  // ─── Mobile-specific ──────────────────────────────────────────────────────

  it('shows Mobile menu button when isMobile is true', () => {
    render(<ChatHeader {...DEFAULT_PROPS} isMobile={true} />);
    expect(screen.getByRole('button', { name: /open menu/i })).toBeTruthy();
  });

  it('calls onOpenMenu when menu button clicked', () => {
    const onOpenMenu = vi.fn();
    render(<ChatHeader {...DEFAULT_PROPS} isMobile={true} onOpenMenu={onOpenMenu} />);
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(onOpenMenu).toHaveBeenCalled();
  });

  it('shows mobile stats when isMobile is true', () => {
    render(
      <ChatHeader
        {...DEFAULT_PROPS}
        isMobile={true}
        mobileSessionStats={{ totalActions: 5, completed: 3, processing: 2 }}
      />,
    );
    expect(screen.getByTitle('Total actions')).toBeTruthy();
    expect(screen.getByTitle('Completed')).toBeTruthy();
    expect(screen.getByTitle('Processing')).toBeTruthy();
  });

  it('shows mobile activity button when isMobile is true', () => {
    render(<ChatHeader {...DEFAULT_PROPS} isMobile={true} />);
    expect(document.querySelector('[aria-label="Open agent activity"]')).toBeTruthy();
  });

  it('calls onOpenActivity when activity button clicked', () => {
    const onOpenActivity = vi.fn();
    render(<ChatHeader {...DEFAULT_PROPS} isMobile={true} onOpenActivity={onOpenActivity} />);
    fireEvent.click(screen.getByLabelText('Open agent activity'));
    expect(onOpenActivity).toHaveBeenCalled();
  });

  it('shows token usage when sessionTokenUsage is provided and isMobile', () => {
    render(
      <ChatHeader
        {...DEFAULT_PROPS}
        isMobile={true}
        sessionTokenUsage={{ inputTokens: 100, outputTokens: 50 }}
      />,
    );
    expect(screen.getByTitle(/token usage/i)).toBeTruthy();
  });

  it('shows error message for AGENT_OFFLINE state', () => {
    render(
      <ChatHeader {...DEFAULT_PROPS} state={CHAT_STATES.AGENT_OFFLINE} errorMessage="Agent down" />,
    );
    expect(screen.getByText(/agent down/i)).toBeTruthy();
  });

  it('shows Loader2 during AWAITING_RESPONSE on mobile', () => {
    const { container } = render(
      <ChatHeader {...DEFAULT_PROPS} isMobile={true} state={CHAT_STATES.AWAITING_RESPONSE} />,
    );
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  // ─── Terminal button ──────────────────────────────────────────────────────

  it('does not render terminal button when onToggleTerminal is not provided', () => {
    render(<ChatHeader {...DEFAULT_PROPS} />);
    expect(screen.queryByRole('button', { name: /terminal/i })).toBeNull();
  });

  it('renders terminal toggle buttons when onToggleTerminal is provided', () => {
    render(<ChatHeader {...DEFAULT_PROPS} onToggleTerminal={vi.fn()} />);
    // Both desktop (hidden sm:flex) and mobile (sm:hidden) buttons are in DOM.
    const btns = screen.getAllByRole('button', { name: /open terminal/i });
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onToggleTerminal when terminal button is clicked', () => {
    const onToggleTerminal = vi.fn();
    render(<ChatHeader {...DEFAULT_PROPS} onToggleTerminal={onToggleTerminal} />);
    fireEvent.click(screen.getAllByRole('button', { name: /open terminal/i })[0]);
    expect(onToggleTerminal).toHaveBeenCalledTimes(1);
  });

  it('shows "Close terminal" label on both buttons when terminalOpen is true', () => {
    render(<ChatHeader {...DEFAULT_PROPS} onToggleTerminal={vi.fn()} terminalOpen={true} />);
    const btns = screen.getAllByRole('button', { name: /close terminal/i });
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  it('sets aria-pressed=true on terminal buttons when terminalOpen is true', () => {
    render(<ChatHeader {...DEFAULT_PROPS} onToggleTerminal={vi.fn()} terminalOpen={true} />);
    const btns = screen.getAllByRole('button', { name: /close terminal/i });
    btns.forEach((btn) => expect(btn.getAttribute('aria-pressed')).toBe('true'));
  });

  it('sets aria-pressed=false on terminal buttons when terminalOpen is false', () => {
    render(<ChatHeader {...DEFAULT_PROPS} onToggleTerminal={vi.fn()} terminalOpen={false} />);
    const btns = screen.getAllByRole('button', { name: /open terminal/i });
    btns.forEach((btn) => expect(btn.getAttribute('aria-pressed')).toBe('false'));
  });

  // ─── Tony Stark ───────────────────────────────────────────────────────────

  it('renders Tony Stark link when onToggleTonyStarkMode is provided', () => {
    render(
      <MemoryRouter>
        <ChatHeader {...DEFAULT_PROPS} onToggleTonyStarkMode={vi.fn()} tonyStarkMode={false} />
      </MemoryRouter>,
    );
    const link = screen.getByTitle('Tony Stark');
    expect(link).toBeTruthy();
    expect(link.tagName).toBe('A'); // Because we use react-router-dom Link, in tests it renders as an anchor
    expect(link.getAttribute('href')).toBe('/stark');
  });

  it('does not render Tony Stark link when onToggleTonyStarkMode is not provided', () => {
    render(<ChatHeader {...DEFAULT_PROPS} />);
    expect(screen.queryByTitle('Tony Stark')).toBeNull();
  });

  // ─── Simplicate mode ──────────────────────────────────────────────────────

  it('renders compact header when Simplicate is on with sidebar menu and no idle status/search', () => {
    render(
      <ChatHeader
        {...DEFAULT_PROPS}
        agentProviderLabel="Claude"
        currentModel="haiku"
        simplicateMode
      />,
    );

    expect(screen.getByRole('button', { name: /open menu/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /more actions/i })).toBeTruthy();
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.getByText('haiku')).toBeTruthy();
    expect(screen.queryByText('Ready')).toBeNull();
    expect(screen.queryByPlaceholderText(/search in conversation/i)).toBeNull();
  });

  it('opens compact actions menu with displaced controls', () => {
    render(
      <MemoryRouter>
        <ChatHeader
          {...DEFAULT_PROPS}
          simplicateMode
          onToggleTonyStarkMode={vi.fn()}
          onToggleTerminal={vi.fn()}
          onToggleCli={vi.fn()}
          onSimplicateModeChange={vi.fn()}
          mobileSessionStats={{ totalActions: 9, completed: 9, processing: 0 }}
          sessionTokenUsage={{ inputTokens: 3000, outputTokens: 1200 }}
          sessionTimeMs={22000}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));

    expect(screen.getByRole('menu', { name: /chat actions/i })).toBeTruthy();
    expect(screen.getByText('Tony Stark')).toBeTruthy();
    expect(screen.queryByLabelText('Playgrounds')).toBeNull();
    expect(screen.getByRole('menuitem', { name: /terminal/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /commands/i })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /files/i })).toBeNull();
    const simplicateSwitch = screen.getByRole('switch', { name: /simplicate/i });
    expect(simplicateSwitch.getAttribute('aria-checked')).toBe('true');
    expect(simplicateSwitch.className).toContain('inline-flex');
    expect(simplicateSwitch.className).toContain('justify-end');
    expect(simplicateSwitch.firstElementChild?.className).not.toContain('absolute');
    expect(screen.getByText(/9\/9\/0 · 3k in \/ 1\.2k out · 22s/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/search in conversation/i)).toBeTruthy();
  });

  it('runs compact menu actions', () => {
    const onToggleTerminal = vi.fn();
    const onSimplicateModeChange = vi.fn();
    render(
      <ChatHeader
        {...DEFAULT_PROPS}
        simplicateMode
        onToggleTerminal={onToggleTerminal}
        onSimplicateModeChange={onSimplicateModeChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /terminal/i }));
    expect(onToggleTerminal).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByRole('switch', { name: /simplicate/i }));
    expect(onSimplicateModeChange).toHaveBeenCalledWith(false);
  });

  it('shows compact status instead of provider/model when not idle', () => {
    render(
      <ChatHeader
        {...DEFAULT_PROPS}
        agentProviderLabel="Claude"
        currentModel="haiku"
        state={CHAT_STATES.AUTH_PENDING}
        simplicateMode
      />,
    );

    expect(screen.getByText('Authentication in progress...')).toBeTruthy();
    expect(screen.queryByText('Claude')).toBeNull();
    expect(screen.queryByText('haiku')).toBeNull();
  });

  it('opens provider/model dropdown from standard header with model and effort controls', () => {
    const onEffortSelect = vi.fn();
    render(
      <ChatHeader
        {...DEFAULT_PROPS}
        agentProviderLabel="Claude"
        currentModel="haiku"
        currentEffort="high"
        onEffortSelect={onEffortSelect}
        showModelSelector
        modelOptions={['haiku']}
        onModelSelect={vi.fn()}
        onModelInputChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /change model and effort/i }));

    expect(screen.getByRole('dialog', { name: /change model and effort/i })).toBeTruthy();
    expect(screen.getByTestId('model-selector').textContent).toBe('haiku');
    const range = screen.getByRole('slider', { name: /effort/i }) as HTMLInputElement;
    expect(range.value).toBe('2');
    fireEvent.change(range, { target: { value: '0' } });
    expect(onEffortSelect).toHaveBeenCalledWith('low');
  });

  it('opens provider/model dropdown from Simplicate header', () => {
    render(
      <ChatHeader
        {...DEFAULT_PROPS}
        agentProviderLabel="Claude"
        currentModel="haiku"
        currentEffort="max"
        onEffortSelect={vi.fn()}
        simplicateMode
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /change model and effort/i }));
    expect(screen.getByRole('dialog', { name: /change model and effort/i })).toBeTruthy();
    expect(screen.getByRole('slider', { name: /effort/i })).toBeTruthy();
  });

  it('switches conversations from the Simplicate header picker', () => {
    const onConversationSelect = vi.fn();
    render(
      <ChatHeader
        {...DEFAULT_PROPS}
        agentProviderLabel="Claude"
        currentModel="haiku"
        simplicateMode
        conversations={[
          { id: 'default', title: 'Default', createdAt: '2026-01-01', lastMessageAt: '2026-01-01' },
          { id: 'thread-1', title: 'Thread one', createdAt: '2026-01-01', lastMessageAt: '2026-01-01' },
        ]}
        activeConversationId="default"
        onConversationSelect={onConversationSelect}
        onConversationCreate={vi.fn()}
      />,
    );

    expect(screen.queryByText('Default')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /switch conversation/i }));
    const threadItem = screen.getByRole('menuitem', { name: /thread one/i });
    fireEvent.mouseDown(threadItem);
    expect(screen.getByRole('menu', { name: /conversations/i })).toBeTruthy();
    fireEvent.click(threadItem);

    expect(onConversationSelect).toHaveBeenCalledWith('thread-1');
    expect(screen.queryByRole('menu', { name: /conversations/i })).toBeNull();
  });

  // ─── Reset conversation ───────────────────────────────────────────────────

  it('shows Reset conversation item in MoreActionsMenu when onResetConversation is provided', () => {
    const onResetConversation = vi.fn();
    render(
      <ChatHeader
        {...DEFAULT_PROPS}
        simplicateMode={true}
        onResetConversation={onResetConversation}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.getByRole('menuitem', { name: /reset conversation/i })).toBeTruthy();
  });

  it('calls onResetConversation and closes the menu when Reset is clicked', () => {
    const onResetConversation = vi.fn();
    render(
      <ChatHeader
        {...DEFAULT_PROPS}
        simplicateMode={true}
        onResetConversation={onResetConversation}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /reset conversation/i }));
    expect(onResetConversation).toHaveBeenCalledTimes(1);
    // Menu should close after clicking
    expect(screen.queryByRole('menu', { name: /chat actions/i })).toBeNull();
  });

  it('does not show Reset conversation item when onResetConversation is not provided', () => {
    render(
      <ChatHeader
        {...DEFAULT_PROPS}
        simplicateMode={true}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.queryByRole('menuitem', { name: /reset conversation/i })).toBeNull();
  });

  describe('simplicate header keyboard tracking', () => {
    function setVisualViewport(offsetTop: number) {
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        writable: true,
        value: {
          offsetTop,
          height: 400,
          width: window.innerWidth,
          scale: 1,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        },
      });
    }

    afterEach(() => {
      Object.defineProperty(window, 'visualViewport', { configurable: true, writable: true, value: undefined });
    });

    it('translates the simplicate header by visualViewport.offsetTop on mobile', () => {
      setVisualViewport(120);
      const { container } = render(
        <ChatHeader
          {...DEFAULT_PROPS}
          isMobile={true}
          simplicateMode={true}
        />,
      );
      const header = container.querySelector('header');
      expect(header).toBeTruthy();
      expect(header?.style.transform).toBe('translateY(120px)');
    });

    it('does not translate the simplicate header when visualViewport.offsetTop is 0', () => {
      setVisualViewport(0);
      const { container } = render(
        <ChatHeader
          {...DEFAULT_PROPS}
          isMobile={true}
          simplicateMode={true}
        />,
      );
      const header = container.querySelector('header');
      expect(header?.style.transform).toBe('');
    });

    it('does not translate the non-simplicate header even when visualViewport.offsetTop is set', () => {
      setVisualViewport(120);
      const { container } = render(
        <MemoryRouter>
          <ChatHeader
            {...DEFAULT_PROPS}
            isMobile={true}
            simplicateMode={false}
          />
        </MemoryRouter>,
      );
      const header = container.querySelector('header');
      expect(header?.style.transform).toBe('');
    });
  });
});
