import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatHeader } from './chat-header';
import { CHAT_STATES } from './chat-state';

vi.mock('./model-selector', () => ({
  ModelSelector: ({ visible, currentModel }: { visible: boolean; currentModel: string }) =>
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
  showModelSelector: false,
  currentModel: 'claude-3',
  modelOptions: ['claude-3', 'gpt-4'],
  searchQuery: '',
  filteredMessagesCount: 0,
  onSearchChange: vi.fn(),
  onModelSelect: vi.fn(),
  onModelInputChange: vi.fn(),
  onReconnect: vi.fn(),
  onStartAuth: vi.fn(),
  onOpenMenu: vi.fn(),
  onOpenActivity: vi.fn(),
  modelLocked: false,
};

describe('ChatHeader', () => {
  it('renders "fibe" heading', () => {
    render(<ChatHeader {...DEFAULT_PROPS} />);
    expect(screen.getByText('fibe')).toBeTruthy();
  });

  it('shows session time when sessionTimeMs > 0', () => {
    render(<ChatHeader {...DEFAULT_PROPS} sessionTimeMs={65000} />);
    // formatSessionDurationMs(65000) → "1:05"
    expect(screen.getByTitle('Session time')).toBeTruthy();
  });

  it('shows state label for AUTHENTICATED', () => {
    render(<ChatHeader {...DEFAULT_PROPS} state={CHAT_STATES.AUTHENTICATED} />);
    expect(screen.getByText('Ready')).toBeTruthy();
  });

  it('shows Reconnect button when state is AGENT_OFFLINE', () => {
    render(<ChatHeader {...DEFAULT_PROPS} state={CHAT_STATES.AGENT_OFFLINE} />);
    expect(screen.getByRole('button', { name: /reconnect/i })).toBeTruthy();
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
    render(<ChatHeader {...DEFAULT_PROPS} state={CHAT_STATES.UNAUTHENTICATED} />);
    expect(screen.getByRole('button', { name: /start auth/i })).toBeTruthy();
  });

  it('calls onStartAuth when Start Auth clicked', () => {
    const onStartAuth = vi.fn();
    render(<ChatHeader {...DEFAULT_PROPS} state={CHAT_STATES.UNAUTHENTICATED} onStartAuth={onStartAuth} />);
    fireEvent.click(screen.getByRole('button', { name: /start auth/i }));
    expect(onStartAuth).toHaveBeenCalled();
  });

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
    render(<ChatHeader
      {...DEFAULT_PROPS}
      isMobile={true}
      mobileSessionStats={{ totalActions: 5, completed: 3, processing: 2 }}
    />);
    expect(screen.getByTitle('Total actions')).toBeTruthy();
    expect(screen.getByTitle('Completed')).toBeTruthy();
    expect(screen.getByTitle('Processing')).toBeTruthy();
  });

  it('shows mobile activity button when isMobile is true', () => {
    render(<ChatHeader {...DEFAULT_PROPS} isMobile={true} />);
    expect(screen.getByRole('button', { name: /open agent activity/i })).toBeTruthy();
  });

  it('calls onOpenActivity when activity button clicked', () => {
    const onOpenActivity = vi.fn();
    render(<ChatHeader {...DEFAULT_PROPS} isMobile={true} onOpenActivity={onOpenActivity} />);
    fireEvent.click(screen.getByRole('button', { name: /open agent activity/i }));
    expect(onOpenActivity).toHaveBeenCalled();
  });

  it('shows token usage when sessionTokenUsage is provided and isMobile', () => {
    render(<ChatHeader
      {...DEFAULT_PROPS}
      isMobile={true}
      sessionTokenUsage={{ inputTokens: 100, outputTokens: 50 }}
    />);
    expect(screen.getByTitle(/token usage/i)).toBeTruthy();
  });

  it('shows error message for AGENT_OFFLINE state', () => {
    render(<ChatHeader
      {...DEFAULT_PROPS}
      state={CHAT_STATES.AGENT_OFFLINE}
      errorMessage="Agent down"
    />);
    expect(screen.getByText(/agent down/i)).toBeTruthy();
  });

  it('shows Loader2 during AWAITING_RESPONSE on mobile', () => {
    const { container } = render(<ChatHeader
      {...DEFAULT_PROPS}
      isMobile={true}
      state={CHAT_STATES.AWAITING_RESPONSE}
    />);
    // Loader2 applies animate-spin class
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows ModelSelector when showModelSelector is true', () => {
    render(<ChatHeader {...DEFAULT_PROPS} showModelSelector={true} currentModel="gpt-4" />);
    expect(screen.getByTestId('model-selector')).toBeTruthy();
    expect(screen.getByText('gpt-4')).toBeTruthy();
  });
});
