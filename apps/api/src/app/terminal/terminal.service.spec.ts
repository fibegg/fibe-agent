import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TerminalService } from './terminal.service';

// ─── Mock node-pty ────────────────────────────────────────────────────────────
const mockPty = {
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  onData: vi.fn(),
  onExit: vi.fn(),
};

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPty),
}));

// ─── Mock os module ───────────────────────────────────────────────────────────
vi.mock('node:os', () => ({
  platform: vi.fn(() => 'linux'),
}));

import * as nodePty from 'node-pty';

describe('TerminalService', () => {
  let service: TerminalService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TerminalService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  it('spawns a PTY shell with default dimensions', () => {
    service.create('session-1');
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String),
      [],
      expect.objectContaining({ cols: 80, rows: 24 })
    );
  });

  it('clamps cols below minimum to MIN_COLS (10)', () => {
    service.create('session-1', 2, 24);
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String),
      [],
      expect.objectContaining({ cols: 10 })
    );
  });

  it('clamps rows below minimum to MIN_ROWS (5)', () => {
    service.create('session-1', 80, 1);
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String),
      [],
      expect.objectContaining({ rows: 5 })
    );
  });

  it('stores the session and increments sessionCount', () => {
    expect(service.sessionCount).toBe(0);
    service.create('s1');
    expect(service.sessionCount).toBe(1);
    service.create('s2');
    expect(service.sessionCount).toBe(2);
  });

  it('returns the spawned IPty instance', () => {
    const result = service.create('s1');
    expect(result).toBe(mockPty);
  });

  it('uses SHELL env var when set', () => {
    process.env.SHELL = '/bin/zsh';
    service.create('s1');
    expect(nodePty.spawn).toHaveBeenCalledWith('/bin/zsh', [], expect.any(Object));
    delete process.env.SHELL;
  });

  it('falls back to bash on non-Windows when SHELL not set', () => {
    const savedShell = process.env.SHELL;
    delete process.env.SHELL;
    service.create('s1');
    expect(nodePty.spawn).toHaveBeenCalledWith('bash', [], expect.any(Object));
    if (savedShell !== undefined) process.env.SHELL = savedShell;
  });

  it('uses explicit cwd when provided', () => {
    service.create('s1', 80, 24, '/custom/playground');
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String),
      [],
      expect.objectContaining({ cwd: '/custom/playground' })
    );
  });

  it('falls back to PLAYGROUNDS_DIR when no explicit cwd', () => {
    process.env.PLAYGROUNDS_DIR = '/env/playground';
    service.create('s1');
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String),
      [],
      expect.objectContaining({ cwd: '/env/playground' })
    );
    delete process.env.PLAYGROUNDS_DIR;
  });

  // ── write ───────────────────────────────────────────────────────────────────

  it('forwards data to the PTY process', () => {
    service.create('s1');
    service.write('s1', 'ls -la\n');
    expect(mockPty.write).toHaveBeenCalledWith('ls -la\n');
  });

  it('does nothing on write when session does not exist', () => {
    expect(() => service.write('unknown', 'data')).not.toThrow();
    expect(mockPty.write).not.toHaveBeenCalled();
  });

  // ── resize ──────────────────────────────────────────────────────────────────

  it('resizes the PTY to new dimensions', () => {
    service.create('s1');
    service.resize('s1', 120, 40);
    expect(mockPty.resize).toHaveBeenCalledWith(120, 40);
  });

  it('clamps resize dimensions to minimums', () => {
    service.create('s1');
    service.resize('s1', 1, 1);
    expect(mockPty.resize).toHaveBeenCalledWith(10, 5);
  });

  it('does nothing on resize when session does not exist', () => {
    expect(() => service.resize('unknown', 80, 24)).not.toThrow();
    expect(mockPty.resize).not.toHaveBeenCalled();
  });

  it('swallows errors from PTY resize', () => {
    service.create('s1');
    mockPty.resize.mockImplementationOnce(() => { throw new Error('PTY gone'); });
    expect(() => service.resize('s1', 80, 24)).not.toThrow();
  });

  // ── kill ────────────────────────────────────────────────────────────────────

  it('kills the PTY and removes the session', () => {
    service.create('s1');
    expect(service.sessionCount).toBe(1);
    service.kill('s1');
    expect(mockPty.kill).toHaveBeenCalled();
    expect(service.sessionCount).toBe(0);
  });

  it('does nothing on kill when session does not exist', () => {
    expect(() => service.kill('unknown')).not.toThrow();
    expect(mockPty.kill).not.toHaveBeenCalled();
  });

  it('swallows errors from PTY kill', () => {
    service.create('s1');
    mockPty.kill.mockImplementationOnce(() => { throw new Error('already dead'); });
    expect(() => service.kill('s1')).not.toThrow();
  });

  // ── onModuleDestroy ─────────────────────────────────────────────────────────

  it('kills all sessions on module destroy', () => {
    service.create('s1');
    service.create('s2');
    service.create('s3');
    expect(service.sessionCount).toBe(3);
    service.onModuleDestroy();
    expect(service.sessionCount).toBe(0);
    expect(mockPty.kill).toHaveBeenCalledTimes(3);
  });
});
