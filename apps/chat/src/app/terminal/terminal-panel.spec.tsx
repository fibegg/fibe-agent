import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TerminalPanel } from './terminal-panel';

// ─── Shared mock terminal methods ─────────────────────────────────────────────
const mockWrite    = vi.fn();
const mockDispose  = vi.fn();
const mockOpen     = vi.fn();
const mockLoadAddon = vi.fn();
const mockOnData   = vi.fn();

// Terminal must be a class constructor; each test shares the same vi.fn() refs.
vi.mock('@xterm/xterm', () => ({
  Terminal: class MockTerminal {
    cols = 80;
    rows = 24;
    write      = mockWrite;
    dispose    = mockDispose;
    open       = mockOpen;
    loadAddon  = mockLoadAddon;
    onData     = mockOnData;
  },
}));

vi.mock('@xterm/addon-fit',       () => ({ FitAddon:      class { fit = vi.fn(); } }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {}                 }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

vi.mock('../api-url', () => ({
  getWsUrl:               vi.fn().mockReturnValue('ws://localhost:3000'),
  getAuthTokenForRequest: vi.fn().mockReturnValue(''),
}));

// ─── Fake WebSocket class (must be a real class for `new WebSocket()`) ─────────
// lastWs is updated in the constructor so tests can access the live instance.
const wsInstances: {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
  binaryType: string;
  url: string;
  onopen:    (() => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
  onclose:   (() => void) | null;
  onerror:   (() => void) | null;
}[] = [];

class FakeWebSocket {
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  binaryType = '';
  url: string;
  onopen:    (() => void)                | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose:   (() => void)                | null = null;
  onerror:   (() => void)                | null = null;
  send  = vi.fn();
  close = vi.fn();
  constructor(url: string) {
    this.url = url;
    wsInstances.push(this as never);
  }
}

class FakeResizeObserver {
  observe    = vi.fn();
  disconnect = vi.fn();
  unobserve  = vi.fn();
}

describe('TerminalPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wsInstances.length = 0;
    vi.stubGlobal('WebSocket',             FakeWebSocket);
    vi.stubGlobal('ResizeObserver',        FakeResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 0; });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const getWs = () => wsInstances[wsInstances.length - 1] as FakeWebSocket;

  it('renders the Shell header label', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    expect(screen.getByText('Shell')).toBeTruthy();
  });

  it('renders the fibe-agent subtitle', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    expect(screen.getByText(/fibe-agent/i)).toBeTruthy();
  });

  it('renders a close button', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /close terminal/i })).toBeTruthy();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<TerminalPanel onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close terminal/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens a WebSocket to /ws-terminal on mount', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    expect(getWs().url).toContain('/ws-terminal');
  });

  it('includes token in WebSocket URL when a token is present', async () => {
    const { getAuthTokenForRequest } = await import('../api-url');
    (getAuthTokenForRequest as ReturnType<typeof vi.fn>).mockReturnValue('secret');
    render(<TerminalPanel onClose={vi.fn()} />);
    expect(getWs().url).toContain('token=secret');
  });

  it('disposes the terminal on unmount', () => {
    const { unmount } = render(<TerminalPanel onClose={vi.fn()} />);
    unmount();
    expect(mockDispose).toHaveBeenCalled();
  });

  it('closes the WebSocket on unmount', () => {
    const { unmount } = render(<TerminalPanel onClose={vi.fn()} />);
    unmount();
    expect(getWs().close).toHaveBeenCalled();
  });

  it('writes incoming text messages to the terminal', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    getWs().onmessage?.({ data: 'hello world' } as MessageEvent);
    expect(mockWrite).toHaveBeenCalledWith('hello world');
  });

  it('writes incoming ArrayBuffer messages as Uint8Array', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    const buf = new ArrayBuffer(4);
    getWs().onmessage?.({ data: buf } as MessageEvent);
    expect(mockWrite).toHaveBeenCalledWith(expect.any(Uint8Array));
  });

  it('writes session-closed message when WebSocket closes', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    getWs().onclose?.();
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('Terminal session closed'));
  });

  it('writes connection-error message when WebSocket errors', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    getWs().onerror?.();
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('could not connect'));
  });
});
