import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { X, TerminalSquare } from 'lucide-react';
import { getWsUrl, getAuthTokenForRequest } from '../api-url';

import '@xterm/xterm/css/xterm.css';

// ─── Terminal configuration ────────────────────────────────────────────────────

const TERMINAL_OPTIONS = {
  cursorBlink:      true,
  fontSize:         13,
  fontFamily:       '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
  allowProposedApi: true,
  scrollback:       5000,
  theme: {
    background:      '#0d0d14',
    foreground:      '#e2e8f0',
    cursor:          '#a78bfa',
    cursorAccent:    '#0d0d14',
    selectionBackground: '#7c3aed55',
    black:           '#1e293b',
    red:             '#f87171',
    green:           '#4ade80',
    yellow:          '#facc15',
    blue:            '#818cf8',
    magenta:         '#c084fc',
    cyan:            '#22d3ee',
    white:           '#e2e8f0',
    brightBlack:     '#475569',
    brightRed:       '#fca5a5',
    brightGreen:     '#86efac',
    brightYellow:    '#fde047',
    brightBlue:      '#a5b4fc',
    brightMagenta:   '#d8b4fe',
    brightCyan:      '#67e8f9',
    brightWhite:     '#f8fafc',
  },
} as const;

/** Build the WebSocket URL for /ws-terminal, appending the auth token if present. */
export function buildTerminalWsUrl(): string {
  const token = getAuthTokenForRequest();
  const base   = getWsUrl();
  return token
    ? `${base}/ws-terminal?token=${encodeURIComponent(token)}`
    : `${base}/ws-terminal`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface TerminalPanelProps {
  onClose: () => void;
}

export function TerminalPanel({ onClose }: TerminalPanelProps) {
  const containerRef  = useRef<HTMLDivElement | null>(null);
  const termRef       = useRef<Terminal | null>(null);
  const fitAddonRef   = useRef<FitAddon | null>(null);
  const wsRef         = useRef<WebSocket | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── xterm.js setup ────────────────────────────────────────────
    const term      = new Terminal(TERMINAL_OPTIONS);
    const fitAddon  = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(container);

    termRef.current     = term;
    fitAddonRef.current = fitAddon;

    requestAnimationFrame(() => { try { fitAddon.fit(); } catch { /* ignore */ } });

    // ── WebSocket connection ───────────────────────────────────────
    const ws = new WebSocket(buildTerminalWsUrl());
    wsRef.current   = ws;
    ws.binaryType   = 'arraybuffer';

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = ({ data }) => {
      term.write(typeof data === 'string' ? data : new Uint8Array(data as ArrayBuffer));
    };

    ws.onclose = () => {
      term.write('\r\n\x1b[90m[Terminal session closed]\x1b[0m\r\n');
    };

    ws.onerror = () => {
      term.write('\r\n\x1b[31m[WebSocket error — could not connect to terminal]\x1b[0m\r\n');
    };

    // ── Input → WebSocket ──────────────────────────────────────────
    const onDataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    // ── Resize observer ────────────────────────────────────────────
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        try {
          fitAddon.fit();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
          }
        } catch { /* ignore */ }
      }, 50);
    });
    ro.observe(container);

    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      ro.disconnect();
      onDataDisposable.dispose();
      ws.close();
      term.dispose();
      wsRef.current     = null;
      termRef.current   = null;
      fitAddonRef.current = null;
    };
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0d0d14] border-t border-violet-500/20">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0d0d14]/90 border-b border-violet-500/15 shrink-0">
        <div className="flex items-center gap-2">
          <TerminalSquare className="size-3.5 text-violet-400" aria-hidden />
          <span className="text-xs font-medium text-violet-300 tracking-wide">Shell</span>
          <span className="text-[10px] text-muted-foreground/60">bash · fibe-agent</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="size-6 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close terminal"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* ── xterm.js mount point ──────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden px-2 py-1"
        style={{ background: '#0d0d14' }}
        aria-label="Terminal"
      />
    </div>
  );
}
