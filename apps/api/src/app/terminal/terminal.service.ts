import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as pty from 'node-pty';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';

const MIN_COLS = 10;
const MIN_ROWS = 5;

export interface TerminalSessionInfo {
  id: string;
  cols: number;
  rows: number;
  createdAt: Date;
}

@Injectable()
export class TerminalService implements OnModuleDestroy {
  private readonly sessions = new Map<string, pty.IPty>();

  /** Resolve the shell to use: $SHELL on Unix, powershell on Windows. */
  private resolveShell(): string {
    return process.env.SHELL ?? (os.platform() === 'win32' ? 'powershell.exe' : 'bash');
  }

  /** Clamp dimensions to safe minimums. */
  private clamp(cols: number, rows: number): { cols: number; rows: number } {
    return { cols: Math.max(cols, MIN_COLS), rows: Math.max(rows, MIN_ROWS) };
  }

  /**
   * Spawn a new PTY shell session.
   * @param cwd Working directory for the shell. Falls back to PLAYGROUNDS_DIR then cwd().
   * @returns The spawned `IPty` instance, already stored under `id`.
   */
  create(id: string = randomUUID(), cols = 80, rows = 24, cwd?: string): pty.IPty {
    const { cols: c, rows: r } = this.clamp(cols, rows);
    const shell = this.resolveShell();
    const sessionCwd = cwd ?? process.env.PLAYGROUNDS_DIR ?? process.cwd();

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: c,
      rows: r,
      cwd: sessionCwd,
      env: { ...process.env as Record<string, string>, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
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
    try { p.resize(c, r); } catch { /* ignore if PTY already exited */ }
  }

  kill(id: string): void {
    const p = this.sessions.get(id);
    if (!p) return;
    try { p.kill(); } catch { /* ignore */ }
    this.sessions.delete(id);
  }

  /** Number of active sessions (useful for monitoring / tests). */
  get sessionCount(): number {
    return this.sessions.size;
  }

  onModuleDestroy(): void {
    for (const id of this.sessions.keys()) {
      this.kill(id);
    }
  }
}
