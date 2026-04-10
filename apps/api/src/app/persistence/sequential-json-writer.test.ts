import { describe, test, expect, afterEach } from 'bun:test';
import { SequentialJsonWriter } from './sequential-json-writer';
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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
    await new Promise((r) => setTimeout(r, 100));

    const content = readFileSync(testFile, 'utf8');
    expect(JSON.parse(content)).toEqual({ count: 0 });
  });

  test('serializes rapid concurrent writes in order', async () => {
    let counter = 0;
    const writer = new SequentialJsonWriter(testFile, () => ({ value: counter }));

    counter = 1; writer.schedule();
    counter = 2; writer.schedule();
    counter = 3; writer.schedule();

    await new Promise((r) => setTimeout(r, 300));

    const content = readFileSync(testFile, 'utf8');
    expect(JSON.parse(content)).toEqual({ value: 3 });
  });

  test('catches write errors without breaking the chain', async () => {
    const badPath = '/nonexistent/dir/file.json';
    const writer = new SequentialJsonWriter(badPath, () => ({ data: true }));

    writer.schedule();
    await new Promise((r) => setTimeout(r, 100));

    // Should not throw; chain should still work
    const goodFile = testFile;
    const writer2 = new SequentialJsonWriter(goodFile, () => ({ recovered: true }));
    writer2.schedule();
    await new Promise((r) => setTimeout(r, 100));

    const content = readFileSync(goodFile, 'utf8');
    expect(JSON.parse(content)).toEqual({ recovered: true });
  });

  test('writes encrypted data when encryption key is provided', async () => {
    const writer = new SequentialJsonWriter(testFile, () => ({ secret: 'value' }), 'my-key');
    writer.schedule();
    await new Promise((r) => setTimeout(r, 100));

    const content = readFileSync(testFile, 'utf8');
    expect(content.startsWith('ENC:')).toBe(true);
    expect(content).not.toContain('secret');
  });

  test('handles snapshot function that throws', async () => {
    const writer = new SequentialJsonWriter(testFile, () => {
      throw new Error('snapshot failed');
    });

    writer.schedule();
    await new Promise((r) => setTimeout(r, 100));

    // Should not crash the process; file should not be created
    expect(existsSync(testFile)).toBe(false);
  });

  test('chain recovers after a write failure (BUG: data loss on disk-full)', async () => {
    let shouldFail = true;
    const originalWriteFile = require('node:fs/promises').writeFile;

    // First write will "fail"
    const writer = new SequentialJsonWriter(testFile, () => ({ attempt: shouldFail ? 'failed' : 'recovered' }));

    // Mock writeFile to fail on first call
    const fs = require('node:fs/promises');
    const origWrite = fs.writeFile;
    let callCount = 0;
    fs.writeFile = async (...args: unknown[]) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('ENOSPC: no space left on device');
      }
      return origWrite(...args);
    };

    writer.schedule(); // will fail
    await new Promise((r) => setTimeout(r, 100));

    shouldFail = false;
    writer.schedule(); // should recover
    await new Promise((r) => setTimeout(r, 100));

    fs.writeFile = origWrite; // restore

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
    await new Promise((r) => setTimeout(r, 300));

    const content = readFileSync(testFile, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.length).toBe(1000);
    expect(parsed[999].id).toBe(999);
  });
});
