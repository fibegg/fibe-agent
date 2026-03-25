import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { TerminalService } from './terminal.service';

// ─── Mock node-pty ────────────────────────────────────────────────────────────
const mockPty = {
  write:  mock(() => undefined),
  resize: mock(() => undefined),
  kill:   mock(() => undefined),
  onData: mock(() => undefined),
  onExit: mock(() => undefined),
};

mock.module('node-pty', () => ({
  spawn: mock(() => mockPty),
}));

import * as nodePty from 'node-pty';

// ─── Helpers ─────────────────────────────────────────────────────────────────

describe('TerminalService', () => {
  let service: TerminalService;

  beforeEach(() => {
    mockPty.write.mockClear();
    mockPty.resize.mockClear();
    mockPty.kill.mockClear();
    (nodePty.spawn as ReturnType<typeof mock>).mockClear();
    service = new TerminalService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  // ── create ──────────────────────────────────────────────────────────────────

  it('spawns a PTY shell with default dimensions', () => {
    service.create('s1');
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String),
      [],
      expect.objectContaining({ cols: 80, rows: 24 }),
    );
  });

  it('returns the spawned IPty instance', () => {
    const result = service.create('s1');
    expect(result).toBe(mockPty);
  });

  it('stores the session and increments sessionCount', () => {
    expect(service.sessionCount).toBe(0);
    service.create('s1');
    expect(service.sessionCount).toBe(1);
    service.create('s2');
    expect(service.sessionCount).toBe(2);
  });

  it('auto-generates a UUID id when none is provided', () => {
    service.create();
    expect(service.sessionCount).toBe(1);
  });

  it('clamps cols below minimum to MIN_COLS (10)', () => {
    service.create('s1', 2, 24);
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String), [],
      expect.objectContaining({ cols: 10 }),
    );
  });

  it('clamps rows below minimum to MIN_ROWS (5)', () => {
    service.create('s1', 80, 1);
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String), [],
      expect.objectContaining({ rows: 5 }),
    );
  });

  it('uses SHELL env var when set', () => {
    const saved = process.env.SHELL;
    process.env.SHELL = '/bin/zsh';
    service.create('s1');
    expect(nodePty.spawn).toHaveBeenCalledWith('/bin/zsh', [], expect.any(Object));
    if (saved !== undefined) process.env.SHELL = saved; else delete process.env.SHELL;
  });

  it('falls back to bash on non-Windows when SHELL is unset', () => {
    const saved = process.env.SHELL;
    delete process.env.SHELL;
    // process.platform is 'darwin' or 'linux' in CI — neither is 'win32', so bash is expected
    service.create('s1');
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.stringMatching(/bash|zsh/),
      [],
      expect.any(Object),
    );
    if (saved !== undefined) process.env.SHELL = saved;
  });

  it('uses explicit cwd when provided', () => {
    service.create('s1', 80, 24, '/custom/playground');
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String), [],
      expect.objectContaining({ cwd: '/custom/playground' }),
    );
  });

  it('falls back to PLAYGROUNDS_DIR when no explicit cwd given', () => {
    const saved = process.env.PLAYGROUNDS_DIR;
    process.env.PLAYGROUNDS_DIR = '/env/playground';
    service.create('s1');
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String), [],
      expect.objectContaining({ cwd: '/env/playground' }),
    );
    if (saved !== undefined) process.env.PLAYGROUNDS_DIR = saved; else delete process.env.PLAYGROUNDS_DIR;
  });

  it('falls back to process.cwd() when neither cwd nor PLAYGROUNDS_DIR is set', () => {
    const saved = process.env.PLAYGROUNDS_DIR;
    delete process.env.PLAYGROUNDS_DIR;
    const expectedCwd = process.cwd();
    service.create('s1');
    expect(nodePty.spawn).toHaveBeenCalledWith(
      expect.any(String), [],
      expect.objectContaining({ cwd: expectedCwd }),
    );
    if (saved !== undefined) process.env.PLAYGROUNDS_DIR = saved;
  });

  // ── write ───────────────────────────────────────────────────────────────────

  it('forwards data to the PTY process', () => {
    service.create('s1');
    service.write('s1', 'ls -la\n');
    expect(mockPty.write).toHaveBeenCalledWith('ls -la\n');
  });

  it('does nothing on write when session does not exist', () => {
    expect(() => service.write('ghost', 'data')).not.toThrow();
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
    expect(() => service.resize('ghost', 80, 24)).not.toThrow();
    expect(mockPty.resize).not.toHaveBeenCalled();
  });

  it('swallows errors thrown by PTY resize', () => {
    service.create('s1');
    mockPty.resize.mockImplementationOnce(() => { throw new Error('PTY gone'); });
    expect(() => service.resize('s1', 80, 24)).not.toThrow();
  });

  // ── kill ─────────────────────────────────────────────────────────────────────

  it('kills the PTY and removes the session', () => {
    service.create('s1');
    expect(service.sessionCount).toBe(1);
    service.kill('s1');
    expect(mockPty.kill).toHaveBeenCalled();
    expect(service.sessionCount).toBe(0);
  });

  it('does nothing on kill when session does not exist', () => {
    expect(() => service.kill('ghost')).not.toThrow();
    expect(mockPty.kill).not.toHaveBeenCalled();
  });

  it('swallows errors thrown by PTY kill', () => {
    service.create('s1');
    mockPty.kill.mockImplementationOnce(() => { throw new Error('already dead'); });
    expect(() => service.kill('s1')).not.toThrow();
  });

  // ── onModuleDestroy ──────────────────────────────────────────────────────────

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
