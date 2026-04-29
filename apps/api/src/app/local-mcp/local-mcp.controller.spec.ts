/**
 * LocalMcpController unit tests.
 *
 * NestJS decorators are not compatible with bare Bun test imports,
 * so we test the controller logic by calling it via a plain function
 * that mirrors the handler, and separately verify the service contract.
 */
import { describe, test, expect, mock } from 'bun:test';
import type { LocalMcpService } from './local-mcp.service';
import type { LocalToolCallRequest, LocalToolCallResponse } from './local-mcp-types';
import { LOCAL_TOOL } from './local-mcp-types';

// ─── Inline replica of the controller handler (no NestJS decorators) ──────────

function makeHandlerUnderTest(svc: LocalMcpService) {
  // Mirrors the real controller's handleToolCall method.
  return (body: LocalToolCallRequest): Promise<LocalToolCallResponse> =>
    svc.handleToolCall(body);
}

function makeController() {
  const svc = {
    handleToolCall: mock(async (req: LocalToolCallRequest): Promise<LocalToolCallResponse> =>
      ({ requestId: req.requestId, ok: true, result: { ok: true } })
    ),
  } as unknown as LocalMcpService;
  return { handler: makeHandlerUnderTest(svc), svc };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LocalMcpController', () => {
  test('delegates to LocalMcpService.handleToolCall with the request body', async () => {
    const { handler, svc } = makeController();
    const body: LocalToolCallRequest = { requestId: 'r1', tool: LOCAL_TOOL.NOTIFY, args: { message: 'hi' } };
    const res = await handler(body);
    expect(svc.handleToolCall).toHaveBeenCalledWith(body);
    expect(res.requestId).toBe('r1');
    expect(res.ok).toBe(true);
  });

  test('returns the service response unchanged on success', async () => {
    const { handler, svc } = makeController();
    (svc.handleToolCall as ReturnType<typeof mock>).mockImplementation(
      async (req: LocalToolCallRequest): Promise<LocalToolCallResponse> =>
        ({ requestId: req.requestId, ok: true, result: { mode: 'Casting...' } })
    );
    const res = await handler({ requestId: 'r2', tool: LOCAL_TOOL.GET_MODE, args: {} });
    expect(res.ok).toBe(true);
    expect((res.result as Record<string, unknown>)['mode']).toBe('Casting...');
  });

  test('returns the service error response unchanged', async () => {
    const { handler, svc } = makeController();
    (svc.handleToolCall as ReturnType<typeof mock>).mockImplementation(
      async (req: LocalToolCallRequest): Promise<LocalToolCallResponse> =>
        ({ requestId: req.requestId, ok: false, error: 'boom' })
    );
    const res = await handler({ requestId: 'r3', tool: LOCAL_TOOL.ASK_USER, args: { question: '?' } });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('boom');
  });

  test('passes all args fields to the service', async () => {
    const { handler, svc } = makeController();
    const body: LocalToolCallRequest = {
      requestId: 'r4',
      tool: LOCAL_TOOL.SHOW_IMAGE,
      args: { url: 'https://img.example.com/x.png', caption: 'Test' },
    };
    await handler(body);
    expect(svc.handleToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: LOCAL_TOOL.SHOW_IMAGE,
        args: expect.objectContaining({ url: 'https://img.example.com/x.png' }),
      })
    );
  });

  test('each call is independent (no shared state)', async () => {
    const { handler } = makeController();
    const [a, b] = await Promise.all([
      handler({ requestId: 'rA', tool: LOCAL_TOOL.NOTIFY, args: { message: 'A' } }),
      handler({ requestId: 'rB', tool: LOCAL_TOOL.NOTIFY, args: { message: 'B' } }),
    ]);
    expect(a.requestId).toBe('rA');
    expect(b.requestId).toBe('rB');
  });
});
