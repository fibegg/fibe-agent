import { describe, test, expect, afterEach } from 'bun:test';
import { SequentialJsonWriter } from './sequential-json-writer';
import { readdirSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

describe('SequentialJsonWriter', () => {
  const testFile = join(tmpdir(), `sjw-test-${process.pid}-${Date.now()}.json`);

  afterEach(() => {
    try { if (existsSync(testFile)) unlinkSync(testFile); } catch { /* ignore */ }
  });

  test('writes snapshot to file as JSON', async () => {
    const data = { count: 0 };
    const writer = new SequentialJsonWriter(testFile, () => data);
    writer.schedule();
    await writer.flush();

    const content = readFileSync(testFile, 'utf8');
    expect(JSON.parse(content)).toEqual({ count: 0 });
  });

  test('schedule() returns void (not a promise)', () => {
    const writer = new SequentialJsonWriter(testFile, () => ({}));
    const result = writer.schedule();
    expect(result).toBeUndefined();
  });

  test('serializes rapid concurrent writes in order', async () => {
    let counter = 0;
    const writer = new SequentialJsonWriter(testFile, () => ({ value: counter }));

    counter = 1; writer.schedule();
    counter = 2; writer.schedule();
    counter = 3; writer.schedule();

    await writer.flush();

    const content = readFileSync(testFile, 'utf8');
    expect(JSON.parse(content)).toEqual({ value: 3 });
  });

  test('catches write errors without breaking the chain', async () => {
    const badPath = '/nonexistent/dir/file.json';
    const writer = new SequentialJsonWriter(badPath, () => ({ data: true }));

    writer.schedule();
    await writer.flush();

    // Should not throw; a separate writer should work fine
    const goodFile = testFile;
    const writer2 = new SequentialJsonWriter(goodFile, () => ({ recovered: true }));
    writer2.schedule();
    await writer2.flush();

    const content = readFileSync(goodFile, 'utf8');
    expect(JSON.parse(content)).toEqual({ recovered: true });
  });

  test('writes encrypted data when encryption key is provided', async () => {
    const writer = new SequentialJsonWriter(testFile, () => ({ secret: 'value' }), 'my-key');
    writer.schedule();
    await writer.flush();

    const content = readFileSync(testFile, 'utf8');
    expect(content.startsWith('ENC:')).toBe(true);
    expect(content).not.toContain('secret');
  });

  test('handles snapshot function that throws', async () => {
    const writer = new SequentialJsonWriter(testFile, () => {
      throw new Error('snapshot failed');
    });

    writer.schedule();
    await writer.flush();

    // Should not crash the process; file should not be created
    expect(existsSync(testFile)).toBe(false);
  });

  test('chain recovers after a snapshot failure', async () => {
    let shouldFail = true;
    const writer = new SequentialJsonWriter(testFile, () => {
      if (shouldFail) {
        throw new Error('snapshot failed');
      }
      return { attempt: 'recovered' };
    });

    writer.schedule();
    await writer.flush();
    expect(existsSync(testFile)).toBe(false);

    shouldFail = false;
    writer.schedule();
    await writer.flush();

    const content = readFileSync(testFile, 'utf8');
    expect(JSON.parse(content)).toEqual({ attempt: 'recovered' });
  });

  test('handles very large data without corruption', async () => {
    const largeArray = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      data: 'x'.repeat(100),
    }));
    const writer = new SequentialJsonWriter(testFile, () => largeArray);
    writer.schedule();
    await writer.flush();

    const content = readFileSync(testFile, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.length).toBe(1000);
    expect(parsed[999].id).toBe(999);
  });

  test('atomic writes do not leave temporary files after success', async () => {
    const writer = new SequentialJsonWriter(testFile, () => ({ ok: true }));
    writer.schedule();
    await writer.flush();

    const tempPrefix = `.${basename(testFile)}.`;
    const leftovers = readdirSync(tmpdir()).filter((name) =>
      name.startsWith(tempPrefix) && name.endsWith('.tmp')
    );
    expect(leftovers).toEqual([]);
  });

  test('failed write leaves previous file content intact', async () => {
    const goodWriter = new SequentialJsonWriter(testFile, () => ({ version: 'old' }));
    goodWriter.schedule();
    await goodWriter.flush();

    const failingWriter = new SequentialJsonWriter(testFile, () => {
      throw new Error('snapshot failed');
    });
    failingWriter.schedule();
    await failingWriter.flush();

    const content = readFileSync(testFile, 'utf8');
    expect(JSON.parse(content)).toEqual({ version: 'old' });
  });
});

describe('SequentialJsonWriter — debounce mode', () => {
  const testFile = join(tmpdir(), `sjw-debounce-${process.pid}-${Date.now()}.json`);

  afterEach(() => {
    try { if (existsSync(testFile)) unlinkSync(testFile); } catch { /* ignore */ }
  });

  test('rapid schedule() calls coalesce into a single write', async () => {
    let writeCount = 0;
    let value = 0;
    const writer = new SequentialJsonWriter(
      testFile,
      () => { writeCount++; return { value }; },
      undefined,
      50,
    );

    value = 1; writer.schedule();
    value = 2; writer.schedule();
    value = 3; writer.schedule();

    await writer.flush();

    const content = readFileSync(testFile, 'utf8');
    expect(JSON.parse(content)).toEqual({ value: 3 });
    // Snapshot called once (coalesced)
    expect(writeCount).toBe(1);
  });

  test('flush() cancels pending debounce and writes immediately', async () => {
    const writer = new SequentialJsonWriter(testFile, () => ({ flushed: true }), undefined, 5000);

    writer.schedule(); // would fire in 5 s
    await writer.flush(); // must complete immediately

    const content = readFileSync(testFile, 'utf8');
    expect(JSON.parse(content)).toEqual({ flushed: true });
  });

  test('destroy() cancels pending debounce — no file created', async () => {
    const writer = new SequentialJsonWriter(testFile, () => ({ written: true }), undefined, 5000);

    writer.schedule(); // would fire in 5 s
    writer.destroy();

    // Give the timer time to fire (it should not)
    await new Promise((r) => setTimeout(r, 100));
    expect(existsSync(testFile)).toBe(false);
  });

  test('two separate debounce windows produce two writes', async () => {
    let counter = 0;
    const writer = new SequentialJsonWriter(testFile, () => ({ v: counter }), undefined, 30);

    counter = 1; writer.schedule();
    await writer.flush();

    counter = 2; writer.schedule();
    await writer.flush();

    const content = readFileSync(testFile, 'utf8');
    expect(JSON.parse(content)).toEqual({ v: 2 });
  });
});
