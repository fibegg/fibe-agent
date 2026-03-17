import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { UploadsService } from './uploads.service';

describe('UploadsService', () => {
  let dataDir: string;
  const config = { getDataDir: () => '' };

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'uploads-'));
    (config as { getDataDir: () => string }).getDataDir = () => dataDir;
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('getUploadsDir returns path under data dir', () => {
    const service = new UploadsService(config as never);
    expect(service.getUploadsDir()).toBe(join(dataDir, 'uploads'));
  });

  test('saveImage creates file and returns filename', async () => {
    const service = new UploadsService(config as never);
    const dataUrl = 'data:image/png;base64,' + Buffer.from('x').toString('base64');
    const filename = await service.saveImage(dataUrl);
    expect(filename).toMatch(/^[0-9a-f-]+\.png$/);
    const path = service.getPath(filename);
    expect(path).toBeDefined();
    if (path) expect(readFileSync(path).length).toBeGreaterThan(0);
  });

  test('saveImage uses jpg for jpeg mime', async () => {
    const service = new UploadsService(config as never);
    const dataUrl = 'data:image/jpeg;base64,' + Buffer.from('x').toString('base64');
    const filename = await service.saveImage(dataUrl);
    expect(filename).toMatch(/\.jpg$/);
  });

  test('saveAudio creates file from data URL', async () => {
    const service = new UploadsService(config as never);
    const dataUrl = 'data:audio/webm;base64,' + Buffer.from('audio').toString('base64');
    const filename = await service.saveAudio(dataUrl);
    expect(filename).toMatch(/^[0-9a-f-]+\.webm$/);
    expect(service.getPath(filename)).toBeTruthy();
  });

  test('saveAudioFromBuffer creates file with correct extension', async () => {
    const service = new UploadsService(config as never);
    const buf = Buffer.from('audio');
    const filename = await service.saveAudioFromBuffer(buf, 'audio/ogg;codecs=opus');
    expect(filename).toMatch(/\.ogg$/);
    const path = service.getPath(filename);
    expect(path).toBeDefined();
    if (path) expect(readFileSync(path)).toEqual(buf);
  });

  test('saveAudioFromBuffer uses m4a for mp4 mime', async () => {
    const service = new UploadsService(config as never);
    const filename = await service.saveAudioFromBuffer(Buffer.from('x'), 'audio/mp4');
    expect(filename).toMatch(/\.m4a$/);
  });

  test('getPath returns null for path traversal', () => {
    const service = new UploadsService(config as never);
    expect(service.getPath('../etc/passwd')).toBeNull();
    expect(service.getPath('foo/bar')).toBeNull();
  });

  test('getPath returns null for non-existent file', () => {
    const service = new UploadsService(config as never);
    expect(service.getPath('nonexistent.uuid')).toBeNull();
  });

  test('getPath returns path for existing file', async () => {
    const service = new UploadsService(config as never);
    const filename = await service.saveAudioFromBuffer(Buffer.from('x'), 'audio/webm');
    const path = service.getPath(filename);
    expect(path).toBe(join(dataDir, 'uploads', filename));
  });

  test('saveAudioFromBuffer creates uploads dir when missing', async () => {
    const subDir = join(dataDir, 'nested');
    (config as { getDataDir: () => string }).getDataDir = () => subDir;
    const service = new UploadsService(config as never);
    const filename = await service.saveAudioFromBuffer(Buffer.from('x'), 'audio/webm');
    expect(service.getPath(filename)).toBe(join(subDir, 'uploads', filename));
  });

  test('saveFileFromBuffer creates file with correct extension for PDF', async () => {
    const service = new UploadsService(config as never);
    const buf = Buffer.from('pdf content');
    const filename = await service.saveFileFromBuffer(buf, 'application/pdf');
    expect(filename).toMatch(/\.pdf$/);
    const filePath = service.getPath(filename);
    expect(filePath).toBeDefined();
    expect(readFileSync(filePath as string)).toEqual(buf);
  });

  test('saveFileFromBuffer uses correct extension for spreadsheet and text', async () => {
    const service = new UploadsService(config as never);
    expect(await service.saveFileFromBuffer(Buffer.from(''), 'text/csv')).toMatch(/\.csv$/);
    expect(await service.saveFileFromBuffer(Buffer.from(''), 'text/plain')).toMatch(/\.txt$/);
  });
});
