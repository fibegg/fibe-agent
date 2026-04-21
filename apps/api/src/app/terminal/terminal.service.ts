import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as pty from 'node-pty';
import { randomUUID } from 'node:crypto';

const MIN_COLS = 10;
const MIN_ROWS = 5;
const DEFAULT_DATA_DIR = '/app/data';
const RUNTIME_FIBE_BIN_RELATIVE_DIR = '.fibe/bin';

export interface TerminalSessionInfo {
  id: string;
  cols: number;
  rows: number;
  createdAt: Date;
}

@Injectable()
export class TerminalService implements OnModuleDestroy {
  private readonly sessions = new Map<string, pty.IPty>();

  /** Resolve the shell binary: $SHELL on Unix/macOS, powershell on Windows. */
  private resolveShell(): string {
    return process.env.SHELL ?? (process.platform === 'win32' ? 'powershell.exe' : 'bash');
  }

  /** Clamp dimensions to safe minimums to avoid PTY errors. */
  private clamp(cols: number, rows: number): { cols: number; rows: number } {
    return { cols: Math.max(cols, MIN_COLS), rows: Math.max(rows, MIN_ROWS) };
  }

  private buildEnv(): Record<string, string> {
    const env = { ...(process.env as Record<string, string>) };
    const dataDir = env.DATA_DIR || DEFAULT_DATA_DIR;
    const runtimeFibeBinDir = `${dataDir}/${RUNTIME_FIBE_BIN_RELATIVE_DIR}`;
    const path = env.PATH || '';
    env.PATH = [runtimeFibeBinDir, '/usr/local/bin', path].filter(Boolean).join(':');
    env.TERM = 'xterm-256color';
    env.COLORTERM = 'truecolor';
    return env;
  }

  /**
   * Spawn a new PTY shell session.
   * @param id      Session identifier (defaults to a fresh UUID).
   * @param cols    Terminal width  (clamped to ≥ MIN_COLS).
   * @param rows    Terminal height (clamped to ≥ MIN_ROWS).
   * @param cwd     Working directory. Falls back to PLAYGROUNDS_DIR then process.cwd().
   */
  create(id: string = randomUUID(), cols = 80, rows = 24, cwd?: string): pty.IPty {
    const { cols: c, rows: r } = this.clamp(cols, rows);
    const sessionCwd = cwd ?? process.env.PLAYGROUNDS_DIR ?? process.cwd();

    const ptyProcess = pty.spawn(this.resolveShell(), [], {
      name: 'xterm-256color',
      cols: c,
      rows: r,
      cwd: sessionCwd,
      env: this.buildEnv(),
    });

    this.sessions.set(id, ptyProcess);
    return ptyProcess;
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const p = this.sessions.get(id);
    if (!p) return;
    const { cols: c, rows: r } = this.clamp(cols, rows);
    try { p.resize(c, r); } catch { /* ignore — PTY may have already exited */ }
  }

  kill(id: string): void {
    const p = this.sessions.get(id);
    if (!p) return;
    try { p.kill(); } catch { /* ignore */ }
    this.sessions.delete(id);
  }

  /** Number of active sessions. */
  get sessionCount(): number {
    return this.sessions.size;
  }

  onModuleDestroy(): void {
    for (const id of this.sessions.keys()) {
      this.kill(id);
    }
  }
}
