import { describe, test, expect, afterEach } from 'bun:test';
import { LocalMcpService } from './local-mcp.service';
import { WS_EVENT } from '@shared/ws-constants';
import { LOCAL_TOOL } from './local-mcp-types';

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeService(askTimeoutMs = 500): {
  svc: LocalMcpService;
  events: Array<{ type: string; data: Record<string, unknown> }>;
} {
  process.env['ASK_USER_TIMEOUT_MS'] = String(askTimeoutMs);
  const svc = new LocalMcpService();
  // Stub out child-process spawning — only in-process logic is tested here.
  (svc as unknown as { spawnServer(): void }).spawnServer = () => undefined;
  svc.onModuleInit();
  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  svc.outbound$.subscribe((ev) => events.push(ev));
  return { svc, events };
}

describe('LocalMcpService', () => {
  afterEach(() => {
    delete process.env['ASK_USER_TIMEOUT_MS'];
  });

  // ─── Fire-and-forget tools ─────────────────────────────────────────────────

  test('show_image (url) emits SHOW_IMAGE and resolves { ok: true }', async () => {
    const { svc, events } = makeService();
    const res = await svc.handleToolCall({
      requestId: 'r1',
      tool: LOCAL_TOOL.SHOW_IMAGE,
      args: { url: 'https://example.com/img.png', caption: 'Hello' },
    });
    expect(res.ok).toBe(true);
    expect(res.result).toEqual({ ok: true });
    const ev = events.find((e) => e.type === WS_EVENT.SHOW_IMAGE);
    expect(ev?.data['url']).toBe('https://example.com/img.png');
    expect(ev?.data['caption']).toBe('Hello');
  });

  test('show_image without url/base64 returns error', async () => {
    const { svc } = makeService();
    const res = await svc.handleToolCall({
      requestId: 'r2',
      tool: LOCAL_TOOL.SHOW_IMAGE,
      args: {},
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/url or base64/);
  });

  test('show_image with base64 emits correct mimeType default', async () => {
    const { svc, events } = makeService();
    const res = await svc.handleToolCall({
      requestId: 'r3',
      tool: LOCAL_TOOL.SHOW_IMAGE,
      args: { base64: 'abc123' },
    });
    expect(res.ok).toBe(true);
    const ev = events.find((e) => e.type === WS_EVENT.SHOW_IMAGE);
    expect(ev?.data['mimeType']).toBe('image/png');
    expect(ev?.data['base64']).toBe('abc123');
  });

  test('notify emits NOTIFY event', async () => {
    const { svc, events } = makeService();
    const res = await svc.handleToolCall({
      requestId: 'r4',
      tool: LOCAL_TOOL.NOTIFY,
      args: { message: 'Deploy done', level: 'success' },
    });
    expect(res.ok).toBe(true);
    const ev = events.find((e) => e.type === WS_EVENT.NOTIFY);
    expect(ev?.data['message']).toBe('Deploy done');
    expect(ev?.data['level']).toBe('success');
  });

  test('notify defaults level to info', async () => {
    const { svc, events } = makeService();
    await svc.handleToolCall({
      requestId: 'r5',
      tool: LOCAL_TOOL.NOTIFY,
      args: { message: 'Hello' },
    });
    const ev = events.find((e) => e.type === WS_EVENT.NOTIFY);
    expect(ev?.data['level']).toBe('info');
  });

  test('set_title emits SET_TITLE event', async () => {
    const { svc, events } = makeService();
    const res = await svc.handleToolCall({
      requestId: 'r6',
      tool: LOCAL_TOOL.SET_TITLE,
      args: { title: 'My run' },
    });
    expect(res.ok).toBe(true);
    const ev = events.find((e) => e.type === WS_EVENT.SET_TITLE);
    expect(ev?.data['title']).toBe('My run');
  });

  // ─── Mode tools ────────────────────────────────────────────────────────────

  test('get_mode returns mode from injected getter', async () => {
    const { svc } = makeService();
    svc.registerModeAccessors(() => 'Casting...', () => null);
    const res = await svc.handleToolCall({ requestId: 'r7', tool: LOCAL_TOOL.GET_MODE, args: {} });
    expect(res.ok).toBe(true);
    expect((res.result as Record<string, unknown>)['mode']).toBe('Casting...');
  });

  test('get_mode falls back to default when no getter registered', async () => {
    const { svc } = makeService();
    const res = await svc.handleToolCall({ requestId: 'r8', tool: LOCAL_TOOL.GET_MODE, args: {} });
    expect(res.ok).toBe(true);
    expect((res.result as Record<string, unknown>)['mode']).toBe('Exploring...');
  });

  test('set_mode calls the setter and returns resolved mode', async () => {
    const { svc } = makeService();
    svc.registerModeAccessors(() => 'Exploring...', () => 'Casting...');
    const res = await svc.handleToolCall({ requestId: 'r9', tool: LOCAL_TOOL.SET_MODE, args: { mode: 'casting' } });
    expect(res.ok).toBe(true);
    expect((res.result as Record<string, unknown>)['mode']).toBe('Casting...');
  });

  test('set_mode accepts MODE:BUILD trigger values', async () => {
    const { svc } = makeService();
    svc.registerModeAccessors(() => 'Exploring...', () => 'Building...');
    const res = await svc.handleToolCall({ requestId: 'r9b', tool: LOCAL_TOOL.SET_MODE, args: { mode: 'MODE:BUILD' } });
    expect(res.ok).toBe(true);
    expect((res.result as Record<string, unknown>)['mode']).toBe('Building...');
  });

  test('set_mode with invalid value returns error', async () => {
    const { svc } = makeService();
    const res = await svc.handleToolCall({ requestId: 'r10', tool: LOCAL_TOOL.SET_MODE, args: { mode: 'hacking' } });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Invalid mode/);
  });

  test('set_mode returns error when setter returns null', async () => {
    const { svc } = makeService();
    svc.registerModeAccessors(() => 'Exploring...', () => null);
    const res = await svc.handleToolCall({ requestId: 'r11', tool: LOCAL_TOOL.SET_MODE, args: { mode: 'casting' } });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Failed to resolve mode/);
  });

  test('unknown tool returns error', async () => {
    const { svc } = makeService();
    const res = await svc.handleToolCall({ requestId: 'r12', tool: 'no_such_tool' as never, args: {} });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Unknown local tool/);
  });

  // ─── Interactive tools (blocking) ──────────────────────────────────────────

  test('ask_user emits prompt and resolves when resolveQuestion is called', async () => {
    const { svc, events } = makeService(5000);
    const promise = svc.handleToolCall({
      requestId: 'rq1',
      tool: LOCAL_TOOL.ASK_USER,
      args: { question: 'What is your name?', placeholder: 'e.g. Alice' },
    });
    await new Promise((r) => setTimeout(r, 10));
    const ev = events.find((e) => e.type === WS_EVENT.ASK_USER_PROMPT);
    expect(ev?.data['question']).toBe('What is your name?');
    expect(ev?.data['placeholder']).toBe('e.g. Alice');
    if (!ev) throw new Error('Missing event');
    const questionId = ev.data['questionId'] as string;
    svc.resolveQuestion(questionId, { answer: 'Bob' });
    const res = await promise;
    expect(res.ok).toBe(true);
    expect((res.result as Record<string, unknown>)['answer']).toBe('Bob');
  });

  test('ask_user with empty question returns error immediately', async () => {
    const { svc } = makeService();
    const res = await svc.handleToolCall({ requestId: 'rq2', tool: LOCAL_TOOL.ASK_USER, args: { question: '   ' } });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/must not be empty/);
  });

  test('ask_user times out after askTimeoutMs', async () => {
    const { svc } = makeService(50);
    const res = await svc.handleToolCall({ requestId: 'rt1', tool: LOCAL_TOOL.ASK_USER, args: { question: 'Still there?' } });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Timed out/);
  });

  test('confirm_action emits prompt and resolves with confirmed=false', async () => {
    const { svc, events } = makeService(5000);
    const promise = svc.handleToolCall({
      requestId: 'rc1',
      tool: LOCAL_TOOL.CONFIRM_ACTION,
      args: { message: 'Delete all data?', confirmLabel: 'Delete', cancelLabel: 'Cancel' },
    });
    await new Promise((r) => setTimeout(r, 10));
    const ev = events.find((e) => e.type === WS_EVENT.CONFIRM_ACTION_PROMPT);
    expect(ev?.data['message']).toBe('Delete all data?');
    expect(ev?.data['confirmLabel']).toBe('Delete');
    if (!ev) throw new Error('Missing event');
    const questionId = ev.data['questionId'] as string;
    svc.resolveQuestion(questionId, { confirmed: false });
    const res = await promise;
    expect(res.ok).toBe(true);
    expect((res.result as Record<string, unknown>)['confirmed']).toBe(false);
  });

  test('confirm_action with empty message returns error immediately', async () => {
    const { svc } = makeService();
    const res = await svc.handleToolCall({ requestId: 'rc2', tool: LOCAL_TOOL.CONFIRM_ACTION, args: { message: '' } });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/must not be empty/);
  });

  test('confirm_action defaults confirmLabel/cancelLabel', async () => {
    const { svc, events } = makeService(5000);
    const promise = svc.handleToolCall({
      requestId: 'rc3',
      tool: LOCAL_TOOL.CONFIRM_ACTION,
      args: { message: 'Proceed?' },
    });
    await new Promise((r) => setTimeout(r, 10));
    const ev = events.find((e) => e.type === WS_EVENT.CONFIRM_ACTION_PROMPT);
    expect(ev?.data['confirmLabel']).toBe('Yes');
    expect(ev?.data['cancelLabel']).toBe('No');
    if (!ev) throw new Error('Missing event');
    const questionId = ev.data['questionId'] as string;
    svc.resolveQuestion(questionId, { confirmed: true });
    await promise;
  });

  test('resolveQuestion with unknown id is a no-op (no throw)', () => {
    const { svc } = makeService();
    expect(() => svc.resolveQuestion('ghost-id', {})).not.toThrow();
  });
});
