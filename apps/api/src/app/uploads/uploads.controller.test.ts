import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BadRequestException } from '@nestjs/common';
import { UploadsController } from './uploads.controller';

describe('UploadsController', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'uploads-ctrl-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('getFile returns 404 when path not found', async () => {
    const uploads = { getPath: () => null as string | null };
    const controller = new UploadsController(uploads as never);
    const sent = { value: 0 };
    const res = { status: (code: number) => ({ send: () => { sent.value = code; } }) };
    await controller.getFile('missing', res as never);
    expect(sent.value).toBe(404);
  });

  test('getFile sends stream when path exists', async () => {
    const filePath = join(tmpDir, 'a.webm');
    writeFileSync(filePath, '');
    const uploads = { getPath: (filename: string) => (filename === 'a.webm' ? filePath : null) };
    const controller = new UploadsController(uploads as never);
    let sent: unknown;
    const res = { send: (payload: unknown) => { sent = payload; } };
    await controller.getFile('a.webm', res as never);
    expect(sent).toBeDefined();
    if (sent && typeof (sent as { on?: (ev: string, fn: () => void) => void }).on === 'function') {
      await new Promise<void>((resolve, reject) => {
        const s = sent as NodeJS.ReadableStream;
        s.on('end', () => resolve());
        s.on('error', reject);
        s.resume();
      });
    }
  });

  test('uploadFile throws when no file', async () => {
    const uploads = {};
    const controller = new UploadsController(uploads as never);
    const req = { file: async () => undefined };
    await expect(controller.uploadFile(req as never)).rejects.toThrow(BadRequestException);
  });

  test('uploadFile throws when mimetype not audio', async () => {
    const uploads = {};
    const controller = new UploadsController(uploads as never);
    const req = { file: async () => ({ mimetype: 'image/png', toBuffer: async () => Buffer.from('') }) };
    await expect(controller.uploadFile(req as never)).rejects.toThrow(BadRequestException);
  });

  test('uploadFile returns filename for valid audio', async () => {
    const uploads = { saveAudioFromBuffer: () => 'saved.webm' };
    const controller = new UploadsController(uploads as never);
    const req = { file: async () => ({ mimetype: 'audio/webm', toBuffer: async () => Buffer.from('') }) };
    const result = await controller.uploadFile(req as never);
    expect(result).toEqual({ filename: 'saved.webm' });
  });
});
