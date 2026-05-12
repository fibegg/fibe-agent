import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as pty from 'node-pty';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

  /** Resolve the shell binary without relying on PATH when common absolute paths exist. */
  private resolveShell(): string {
    const configuredShell = process.env.SHELL?.trim();
    if (configuredShell) return configuredShell;

    if (process.platform === 'win32') return 'powershell.exe';

    for (const shell of ['/bin/bash', '/usr/bin/bash', '/bin/sh', '/usr/bin/sh']) {
      if (existsSync(shell)) return shell;
    }

    return 'sh';
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

  private resolveCwd(cwd?: string): string {
    const preferred = cwd || process.env.PLAYGROUNDS_DIR || `${process.cwd()}/playground`;
    try {
      mkdirSync(preferred, { recursive: true });
      if (existsSync(preferred)) return preferred;
    } catch {
      // Fall back to the process cwd below; node-pty fails hard when cwd is missing.
    }
    return process.cwd();
  }

  private ensurePtyRuntime(): void {
    if (process.platform !== 'darwin') return;

    try {
      const packagePath = require.resolve('node-pty/package.json');
      const helperPath = join(dirname(packagePath), 'prebuilds', `darwin-${process.arch}`, 'spawn-helper');
      if (existsSync(helperPath)) chmodSync(helperPath, 0o755);
    } catch {
      // node-pty will surface the actual spawn error if the helper is still unusable.
    }
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
    const sessionCwd = this.resolveCwd(cwd);
    this.ensurePtyRuntime();

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
