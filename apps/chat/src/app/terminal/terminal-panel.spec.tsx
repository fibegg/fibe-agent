import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TerminalPanel, buildTerminalWsUrl } from './terminal-panel';

// ─── Mock Terminal & addons ────────────────────────────────────────────────────

const mockWrite    = vi.fn();
const mockDispose  = vi.fn();
const mockOpen     = vi.fn();
const mockLoadAddon = vi.fn();
const mockOnData   = vi.fn() as ReturnType<typeof vi.fn> & ((cb: (data: string) => void) => void);

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    write     = mockWrite;
    dispose   = mockDispose;
    open      = mockOpen;
    loadAddon = mockLoadAddon;
    onData    = mockOnData;
  },
}));

vi.mock('@xterm/addon-fit',       () => ({ FitAddon:      class { fit = vi.fn(); } }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {}                 }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

vi.mock('../api-url', () => ({
  getWsUrl:               vi.fn().mockReturnValue('ws://localhost:3000'),
  getAuthTokenForRequest: vi.fn().mockReturnValue(''),
}));

// ─── Fake WebSocket ────────────────────────────────────────────────────────────

const wsInstances: FakeWebSocket[] = [];

class FakeWebSocket {
  static OPEN = 1;
  readyState  = FakeWebSocket.OPEN;
  binaryType  = '';
  url: string;
  onopen:    (() => void)                | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose:   (() => void)                | null = null;
  onerror:   (() => void)                | null = null;
  send  = vi.fn();
  close = vi.fn();
  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
  }
}

class FakeResizeObserver {
  observe    = vi.fn();
  disconnect = vi.fn();
  unobserve  = vi.fn();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const latest = () => wsInstances[wsInstances.length - 1];

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  vi.clearAllMocks();
  wsInstances.length = 0;
  // Reset token mock to empty string so tests don't bleed into each other
  const { getAuthTokenForRequest } = await import('../api-url');
  (getAuthTokenForRequest as ReturnType<typeof vi.fn>).mockReturnValue('');
  vi.stubGlobal('WebSocket',             FakeWebSocket);
  vi.stubGlobal('ResizeObserver',        FakeResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 0; });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── buildTerminalWsUrl ───────────────────────────────────────────────────────

describe('buildTerminalWsUrl', () => {
  it('returns /ws-terminal URL without token when token is empty', async () => {
    const { getAuthTokenForRequest } = await import('../api-url');
    (getAuthTokenForRequest as ReturnType<typeof vi.fn>).mockReturnValue('');
    expect(buildTerminalWsUrl()).toBe('ws://localhost:3000/ws-terminal');
  });

  it('appends token param when token is present', async () => {
    const { getAuthTokenForRequest } = await import('../api-url');
    (getAuthTokenForRequest as ReturnType<typeof vi.fn>).mockReturnValue('abc123');
    expect(buildTerminalWsUrl()).toContain('token=abc123');
  });
});

// ─── TerminalPanel rendering ──────────────────────────────────────────────────

describe('TerminalPanel', () => {
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

  // ── WebSocket lifecycle ─────────────────────────────────────────────────────

  it('opens a WebSocket to /ws-terminal on mount', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    expect(latest().url).toContain('/ws-terminal');
  });

  it('URL does NOT include token= when token is empty', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    expect(latest().url).not.toContain('token=');
  });

  it('includes token in WebSocket URL when a token is present', async () => {
    const { getAuthTokenForRequest } = await import('../api-url');
    (getAuthTokenForRequest as ReturnType<typeof vi.fn>).mockReturnValue('secret');
    render(<TerminalPanel onClose={vi.fn()} />);
    expect(latest().url).toContain('token=secret');
  });

  it('sends initial resize message on WS open', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    latest().onopen?.();
    expect(latest().send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'resize', cols: 80, rows: 24 }),
    );
  });

  it('disposes the terminal on unmount', () => {
    const { unmount } = render(<TerminalPanel onClose={vi.fn()} />);
    unmount();
    expect(mockDispose).toHaveBeenCalled();
  });

  it('closes the WebSocket on unmount', () => {
    const { unmount } = render(<TerminalPanel onClose={vi.fn()} />);
    unmount();
    expect(latest().close).toHaveBeenCalled();
  });

  // ── Incoming messages ───────────────────────────────────────────────────────

  it('writes incoming text messages to the terminal', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    latest().onmessage?.({ data: 'hello world' } as MessageEvent);
    expect(mockWrite).toHaveBeenCalledWith('hello world');
  });

  it('writes incoming ArrayBuffer messages as Uint8Array', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    latest().onmessage?.({ data: new ArrayBuffer(4) } as MessageEvent);
    expect(mockWrite).toHaveBeenCalledWith(expect.any(Uint8Array));
  });

  it('writes session-closed message when WebSocket closes', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    latest().onclose?.();
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('Terminal session closed'));
  });

  it('writes connection-error message when WebSocket errors', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    latest().onerror?.();
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('could not connect'));
  });

  // ── Keyboard input ──────────────────────────────────────────────────────────

  it('sends keyboard input to WebSocket when connection is OPEN', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    // Capture the onData callback registered with the terminal
    const onDataCb = mockOnData.mock.calls[0]?.[0] as ((d: string) => void) | undefined;
    expect(onDataCb).toBeDefined();
    latest().readyState = FakeWebSocket.OPEN;
    onDataCb?.('ls\r');
    expect(latest().send).toHaveBeenCalledWith('ls\r');
  });

  it('does NOT send keyboard input when WebSocket is not OPEN', () => {
    render(<TerminalPanel onClose={vi.fn()} />);
    const onDataCb = mockOnData.mock.calls[0]?.[0] as ((d: string) => void) | undefined;
    latest().readyState = 3; // CLOSED
    onDataCb?.('ls\r');
    expect(latest().send).not.toHaveBeenCalled();
  });
});
