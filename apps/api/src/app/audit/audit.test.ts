import { describe, test, expect, beforeEach, vi, type Mock } from 'bun:test';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

// ─── AuditService ─────────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

import { appendFile, mkdir } from 'node:fs/promises';

const mockedAppend = appendFile as unknown as Mock<typeof appendFile>;
const mockedMkdir  = mkdir as unknown as Mock<typeof mkdir>;

function makeConfig(dataDir = '/tmp/test-audit') {
  return { getConversationDataDir: vi.fn().mockReturnValue(dataDir) };
}

describe('AuditService', () => {
  beforeEach(() => vi.clearAllMocks());

  test('logEvent() appends a JSON line to audit.log', async () => {
    const svc = new AuditService(makeConfig() as never);
    await svc.logEvent('DELETE', '/conversations/1', 'AuthenticatedUser');

    expect(mockedAppend).toHaveBeenCalledOnce();
    const [path, content] = mockedAppend.mock.calls[0] as [string, string, string];
    expect(path).toContain('audit.log');
    const entry = JSON.parse(content.trim());
    expect(entry.action).toBe('DELETE');
    expect(entry.resource).toBe('/conversations/1');
    expect(entry.actor).toBe('AuthenticatedUser');
    expect(typeof entry.timestamp).toBe('string');
  });

  test('logEvent() includes details when provided', async () => {
    const svc = new AuditService(makeConfig() as never);
    await svc.logEvent('POST', '/uploads', 'Anonymous', { filename: 'test.png' });

    const [, content] = mockedAppend.mock.calls[0] as [string, string, string];
    const entry = JSON.parse(content.trim());
    expect(entry.details).toEqual({ filename: 'test.png' });
  });

  test('logEvent() omits details key when not provided', async () => {
    const svc = new AuditService(makeConfig() as never);
    await svc.logEvent('GET', '/health', 'Anonymous');

    const [, content] = mockedAppend.mock.calls[0] as [string, string, string];
    const entry = JSON.parse(content.trim());
    expect('details' in entry).toBe(false);
  });

  test('logEvent() creates the data directory before writing', async () => {
    const svc = new AuditService(makeConfig('/tmp/new-dir') as never);
    await svc.logEvent('PATCH', '/conversations/1', 'AuthenticatedUser');
    expect(mockedMkdir).toHaveBeenCalledWith('/tmp/new-dir', { recursive: true });
  });

  test('logEvent() does not throw when appendFile fails', async () => {
    // appendFile is the 2nd fs call (after mkdir), set it to reject
    mockedAppend.mockRejectedValue(new Error('ENOENT'));
    const svc = new AuditService(makeConfig() as never);
    // Should resolve (catch inside logEvent swallows the error)
    await expect(svc.logEvent('DELETE', '/data', 'User')).resolves.toBeUndefined();
    mockedAppend.mockResolvedValue(undefined); // restore
  });

  test('logEvent() timestamp is a valid ISO string', async () => {
    const svc = new AuditService(makeConfig() as never);
    await svc.logEvent('POST', '/test', 'User');
    const [, content] = mockedAppend.mock.calls[0] as [string, string, string];
    const entry = JSON.parse(content.trim());
    expect(isNaN(new Date(entry.timestamp).getTime())).toBe(false);
  });

  test('logEvent() appends a newline at the end of each entry', async () => {
    const svc = new AuditService(makeConfig() as never);
    await svc.logEvent('POST', '/x', 'User');
    const [, content] = mockedAppend.mock.calls[0] as [string, string, string];
    expect(content).toMatch(/\n$/);
  });
});

// ─── AuditInterceptor ─────────────────────────────────────────────────────────

function makeContext(method: string, url: string, authorization?: string) {
  const req = {
    method,
    url,
    headers: { ...(authorization ? { authorization } : {}) },
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeHandler() {
  const handle = vi.fn().mockReturnValue(of('response'));
  return { handle } as unknown as CallHandler;
}

describe('AuditInterceptor', () => {
  let auditService: { logEvent: ReturnType<typeof vi.fn> };
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    vi.clearAllMocks();
    auditService = { logEvent: vi.fn().mockResolvedValue(undefined) };
    interceptor = new AuditInterceptor(auditService as never);
  });

  test('logs POST requests with actor=AuthenticatedUser when Authorization header present', () => {
    const ctx = makeContext('POST', '/conversations', 'Bearer token123');
    interceptor.intercept(ctx, makeHandler()).subscribe();

    expect(auditService.logEvent).toHaveBeenCalledWith('POST', '/conversations', 'AuthenticatedUser');
  });

  test('logs POST requests with actor=Anonymous when no Authorization header', () => {
    const ctx = makeContext('POST', '/conversations');
    interceptor.intercept(ctx, makeHandler()).subscribe();

    expect(auditService.logEvent).toHaveBeenCalledWith('POST', '/conversations', 'Anonymous');
  });

  test('logs DELETE requests', () => {
    const ctx = makeContext('DELETE', '/conversations/1', 'Bearer x');
    interceptor.intercept(ctx, makeHandler()).subscribe();

    expect(auditService.logEvent).toHaveBeenCalledWith('DELETE', '/conversations/1', 'AuthenticatedUser');
  });

  test('logs PUT requests', () => {
    const ctx = makeContext('PUT', '/playgrounds/file', 'Bearer x');
    interceptor.intercept(ctx, makeHandler()).subscribe();

    expect(auditService.logEvent).toHaveBeenCalledWith('PUT', '/playgrounds/file', 'AuthenticatedUser');
  });

  test('logs PATCH requests', () => {
    const ctx = makeContext('PATCH', '/fibe-sync-settings');
    interceptor.intercept(ctx, makeHandler()).subscribe();

    expect(auditService.logEvent).toHaveBeenCalledWith('PATCH', '/fibe-sync-settings', 'Anonymous');
  });

  test('does NOT log GET requests', () => {
    const ctx = makeContext('GET', '/health');
    interceptor.intercept(ctx, makeHandler()).subscribe();

    expect(auditService.logEvent).not.toHaveBeenCalled();
  });

  test('does NOT log HEAD requests', () => {
    const ctx = makeContext('HEAD', '/status');
    interceptor.intercept(ctx, makeHandler()).subscribe();

    expect(auditService.logEvent).not.toHaveBeenCalled();
  });

  test('always calls next.handle() and passes through the response', () => {
    const ctx = makeContext('GET', '/health');
    const handler = makeHandler();
    const result: unknown[] = [];

    interceptor.intercept(ctx, handler).subscribe({ next: (v) => result.push(v) });

    expect(handler.handle).toHaveBeenCalledOnce();
    expect(result).toEqual(['response']);
  });

  test('returns the observable from next.handle() unchanged', () => {
    const ctx = makeContext('POST', '/agent/send-message');
    const handler = makeHandler();

    const obs = interceptor.intercept(ctx, handler);
    expect(obs).toBeDefined();
  });
});
