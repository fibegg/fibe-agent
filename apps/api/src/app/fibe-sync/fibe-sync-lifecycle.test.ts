import { afterEach, beforeEach, expect, jest, mock, test } from 'bun:test';
import { FibeSyncService } from './fibe-sync.service';

const originalFetch = globalThis.fetch;
let service: FibeSyncService;
beforeEach(() => {
  jest.useFakeTimers();
  service = new FibeSyncService({
    isFibeSyncEnabled: () => true,
    isFibeHydrateEnabled: () => true,
    getFibeApiUrl: () => 'https://sync.invalid',
    getFibeApiKey: () => 'synthetic',
    getFibeAgentId: () => 'fixture',
  } as never);
});
afterEach(() => {
  service.onModuleDestroy();
  jest.useRealTimers();
  globalThis.fetch = originalFetch;
});
async function tick(ms: number) {
  jest.advanceTimersByTime(ms);
  for (let i = 0; i < 5; i++)
    await new Promise((resolve) => setImmediate(resolve));
}
function untilAbort(signal: AbortSignal): Promise<never> {
  if (signal.aborted) return Promise.reject(new Error('aborted'));
  return new Promise((_, reject) =>
    signal.addEventListener('abort', () => reject(new Error('aborted')), {
      once: true,
    }),
  );
}

test('an unresponsive attempt times out and retries the newest pending content', async () => {
  let signal: AbortSignal | undefined;
  const fetch = mock((_url: unknown, init: RequestInit) => {
    signal = init.signal as AbortSignal;
    if (fetch.mock.calls.length === 1) return untilAbort(signal);
    return Promise.resolve(new Response('ok'));
  });
  globalThis.fetch = fetch as never;
  service.syncMessages(() => 'old', 'a');
  await tick(500);
  service.syncMessages(() => 'new', 'a');
  await tick(29_999);
  expect(signal?.aborted).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
  await tick(1);
  await tick(999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await tick(1);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(
    JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string).content,
  ).toBe('new');
  await tick(60_000);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('shutdown aborts sync and hydrate, clears retries and refuses new work', async () => {
  const signals: AbortSignal[] = [];
  globalThis.fetch = mock((_url, init: RequestInit) => {
    const signal = init.signal as AbortSignal;
    signals.push(signal);
    return untilAbort(signal);
  }) as never;
  service.syncActivity(() => '[]');
  await tick(500);
  const hydration = service.hydrate('messages');
  await tick(0);
  service.onModuleDestroy();
  expect(signals).toHaveLength(2);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(await hydration).toBeNull();
  service.syncActivity(() => 'later');
  expect(await service.hydrate('messages')).toBeNull();
  await tick(120_000);
  expect(globalThis.fetch).toHaveBeenCalledTimes(2);
});

test('hydration response-body reads remain inside the request deadline', async () => {
  let signal: AbortSignal;
  globalThis.fetch = mock((_url, init: RequestInit) => {
    signal = init.signal as AbortSignal;
    return Promise.resolve({ ok: true, json: () => untilAbort(signal) });
  }) as never;
  const hydration = service.hydrate('messages');
  await tick(30_000);
  expect(await hydration).toBeNull();
  expect(signal?.aborted).toBe(true);
});

test('persistent failures use exponential retry spacing capped at 30 seconds', async () => {
  const fetch = mock(async () => new Response('failure', { status: 500 }));
  globalThis.fetch = fetch as never;
  service.syncMessages(() => 'latest');
  await tick(500);
  let calls = 1;
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    await tick(delay - 1);
    expect(fetch).toHaveBeenCalledTimes(calls);
    await tick(1);
    expect(fetch).toHaveBeenCalledTimes(++calls);
  }
});
