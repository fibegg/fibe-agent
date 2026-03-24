import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { X, TerminalSquare } from 'lucide-react';
import { getWsUrl, getAuthTokenForRequest } from '../api-url';

import '@xterm/xterm/css/xterm.css';

interface TerminalPanelProps {
  onClose: () => void;
}

export function TerminalPanel({ onClose }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ─── xterm.js terminal instance ───────────────────────────────
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      theme: {
        background: '#0d0d14',
        foreground: '#e2e8f0',
        cursor: '#a78bfa',
        cursorAccent: '#0d0d14',
        selectionBackground: '#7c3aed55',
        black:        '#1e293b',
        red:          '#f87171',
        green:        '#4ade80',
        yellow:       '#facc15',
        blue:         '#818cf8',
        magenta:      '#c084fc',
        cyan:         '#22d3ee',
        white:        '#e2e8f0',
        brightBlack:  '#475569',
        brightRed:    '#fca5a5',
        brightGreen:  '#86efac',
        brightYellow: '#fde047',
        brightBlue:   '#a5b4fc',
        brightMagenta:'#d8b4fe',
        brightCyan:   '#67e8f9',
        brightWhite:  '#f8fafc',
      },
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(container);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // initial fit
    requestAnimationFrame(() => { try { fitAddon.fit(); } catch { /* ignore */ } });

    // ─── WebSocket connection ──────────────────────────────────────
    const token = getAuthTokenForRequest();
    const wsBase = getWsUrl();
    const url = token
      ? `${wsBase}/ws-terminal?token=${encodeURIComponent(token)}`
      : `${wsBase}/ws-terminal`;

    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      // Send current terminal dimensions on connect
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    };

    ws.onmessage = (evt) => {
      if (typeof evt.data === 'string') {
        term.write(evt.data);
      } else {
        term.write(new Uint8Array(evt.data as ArrayBuffer));
      }
    };

    ws.onclose = () => {
      term.write('\r\n\x1b[90m[Terminal session closed]\x1b[0m\r\n');
    };

    ws.onerror = () => {
      term.write('\r\n\x1b[31m[WebSocket error — could not connect to terminal]\x1b[0m\r\n');
    };

    // ─── Keyboard input ────────────────────────────────────────────
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // ─── Resize observer for fit ───────────────────────────────────
    const ro = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        const { cols, rows } = term;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      } catch { /* ignore */ }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      ws.close();
      term.dispose();
      wsRef.current = null;
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0d0d14] border-t border-violet-500/20">
      {/* ── Header bar ─────────────────────────────────────────── */}
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

      {/* ── xterm.js mount point ────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden px-2 py-1"
        style={{ background: '#0d0d14' }}
        aria-label="Terminal"
      />
    </div>
  );
}
