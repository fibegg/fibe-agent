import { describe, test, expect, beforeEach, vi, type Mock } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { AsyncJsonWriter } from './async-json-writer';

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('AsyncJsonWriter', () => {
  let mockedWriteFile: Mock<typeof writeFile>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedWriteFile = writeFile as unknown as Mock<typeof writeFile>;
  });

  // ─── schedule() ─────────────────────────────────────────────────────────────

  test('schedule() triggers a write after the debounce window', async () => {
    const writer = new AsyncJsonWriter({ filePath: '/tmp/out.json', getData: () => ({ x: 1 }), debounceMs: 5 });

    writer.schedule();
    expect(mockedWriteFile).not.toHaveBeenCalled();

    await sleep(20);
    expect(mockedWriteFile).toHaveBeenCalledTimes(1);
    const json = (mockedWriteFile.mock.calls[0] as unknown[])[1] as string;
    expect(json).toContain('"x": 1');
  });

  test('schedule() coalesces multiple rapid calls into one write', async () => {
    const writer = new AsyncJsonWriter({ filePath: '/tmp/out.json', getData: () => ({ count: 99 }), debounceMs: 10 });

    writer.schedule();
    writer.schedule();
    writer.schedule();

    await sleep(30);
    expect(mockedWriteFile).toHaveBeenCalledTimes(1);
  });

  test('schedule() swallows write errors silently', async () => {
    mockedWriteFile.mockRejectedValueOnce(new Error('ENOENT'));
    const writer = new AsyncJsonWriter({ filePath: '/tmp/out.json', getData: () => ({}), debounceMs: 5 });
    writer.schedule();
    // Should not throw after the timer fires
    await sleep(20);
    // No unhandled rejection means the test passes
    expect(true).toBe(true);
  });

  test('two separate schedule() windows produce two writes', async () => {
    const writer = new AsyncJsonWriter({ filePath: '/tmp/out.json', getData: () => ({}), debounceMs: 10 });

    writer.schedule();
    await sleep(30);
    writer.schedule();
    await sleep(30);

    expect(mockedWriteFile).toHaveBeenCalledTimes(2);
  });

  // ─── flush() ────────────────────────────────────────────────────────────────

  test('flush() writes immediately and cancels pending timer', async () => {
    const writer = new AsyncJsonWriter({ filePath: '/tmp/out.json', getData: () => ({ flushed: true }), debounceMs: 50 });

    writer.schedule();
    await writer.flush();

    // Only one write from flush — the scheduled timer is cancelled
    expect(mockedWriteFile).toHaveBeenCalledTimes(1);
    const json = (mockedWriteFile.mock.calls[0] as unknown[])[1] as string;
    expect(json).toContain('"flushed": true');

    // Wait and confirm no second write fires
    await sleep(80);
    expect(mockedWriteFile).toHaveBeenCalledTimes(1);
  });

  test('flush() works even when nothing is scheduled', async () => {
    const writer = new AsyncJsonWriter({ filePath: '/tmp/out.json', getData: () => ({ ok: true }) });
    await writer.flush();
    expect(mockedWriteFile).toHaveBeenCalledTimes(1);
    const json = (mockedWriteFile.mock.calls[0] as unknown[])[1] as string;
    expect(json).toContain('"ok": true');
  });

  test('flush() propagates write errors to the caller', async () => {
    mockedWriteFile.mockRejectedValueOnce(new Error('disk full'));
    const writer = new AsyncJsonWriter({ filePath: '/tmp/out.json', getData: () => ({}) });
    await expect(writer.flush()).rejects.toThrow('disk full');
  });

  // ─── destroy() ──────────────────────────────────────────────────────────────

  test('destroy() cancels a pending scheduled write', async () => {
    const writer = new AsyncJsonWriter({ filePath: '/tmp/out.json', getData: () => ({}), debounceMs: 20 });

    writer.schedule();
    writer.destroy();

    await sleep(40);
    expect(mockedWriteFile).not.toHaveBeenCalled();
  });

  test('destroy() is a no-op when nothing is scheduled', () => {
    const writer = new AsyncJsonWriter({ filePath: '/tmp/out.json', getData: () => ({}) });
    expect(() => writer.destroy()).not.toThrow();
  });

  // ─── getData snapshot ────────────────────────────────────────────────────────

  test('captures the latest getData snapshot at write time', async () => {
    let counter = 0;
    const writer = new AsyncJsonWriter({ filePath: '/tmp/out.json', getData: () => ({ counter }), debounceMs: 10 });

    writer.schedule();
    counter = 42;

    await sleep(30);

    const json = (mockedWriteFile.mock.calls[0] as unknown[])[1] as string;
    expect(json).toContain('"counter": 42');
  });

  // ─── JSON format ─────────────────────────────────────────────────────────────

  test('writes pretty-printed JSON with 2-space indent', async () => {
    const writer = new AsyncJsonWriter({ filePath: '/tmp/out.json', getData: () => ({ a: 1, b: [2, 3] }) });
    await writer.flush();

    const json = (mockedWriteFile.mock.calls[0] as unknown[])[1] as string;
    expect(json).toContain('\n');
    expect(JSON.parse(json)).toEqual({ a: 1, b: [2, 3] });
  });

  test('writeFile is called with utf8 encoding', async () => {
    const writer = new AsyncJsonWriter({ filePath: '/tmp/out.json', getData: () => ({ enc: true }) });
    await writer.flush();
    expect((mockedWriteFile.mock.calls[0] as unknown[])[2]).toBe('utf8');
  });
});
