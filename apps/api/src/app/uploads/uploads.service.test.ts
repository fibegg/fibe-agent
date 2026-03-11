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

  test('saveImage creates file and returns filename', () => {
    const service = new UploadsService(config as never);
    const dataUrl = 'data:image/png;base64,' + Buffer.from('x').toString('base64');
    const filename = service.saveImage(dataUrl);
    expect(filename).toMatch(/^[0-9a-f-]+\.png$/);
    const path = service.getPath(filename);
    expect(path).toBeDefined();
    if (path) expect(readFileSync(path).length).toBeGreaterThan(0);
  });

  test('saveImage uses jpg for jpeg mime', () => {
    const service = new UploadsService(config as never);
    const dataUrl = 'data:image/jpeg;base64,' + Buffer.from('x').toString('base64');
    const filename = service.saveImage(dataUrl);
    expect(filename).toMatch(/\.jpg$/);
  });

  test('saveAudio creates file from data URL', () => {
    const service = new UploadsService(config as never);
    const dataUrl = 'data:audio/webm;base64,' + Buffer.from('audio').toString('base64');
    const filename = service.saveAudio(dataUrl);
    expect(filename).toMatch(/^[0-9a-f-]+\.webm$/);
    expect(service.getPath(filename)).toBeTruthy();
  });

  test('saveAudioFromBuffer creates file with correct extension', () => {
    const service = new UploadsService(config as never);
    const buf = Buffer.from('audio');
    const filename = service.saveAudioFromBuffer(buf, 'audio/ogg;codecs=opus');
    expect(filename).toMatch(/\.ogg$/);
    const path = service.getPath(filename);
    expect(path).toBeDefined();
    if (path) expect(readFileSync(path)).toEqual(buf);
  });

  test('saveAudioFromBuffer uses m4a for mp4 mime', () => {
    const service = new UploadsService(config as never);
    const filename = service.saveAudioFromBuffer(Buffer.from('x'), 'audio/mp4');
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

  test('getPath returns path for existing file', () => {
    const service = new UploadsService(config as never);
    const filename = service.saveAudioFromBuffer(Buffer.from('x'), 'audio/webm');
    const path = service.getPath(filename);
    expect(path).toBe(join(dataDir, 'uploads', filename));
  });

  test('saveAudioFromBuffer creates uploads dir when missing', () => {
    const subDir = join(dataDir, 'nested');
    (config as { getDataDir: () => string }).getDataDir = () => subDir;
    const service = new UploadsService(config as never);
    const filename = service.saveAudioFromBuffer(Buffer.from('x'), 'audio/webm');
    expect(service.getPath(filename)).toBe(join(subDir, 'uploads', filename));
  });
});
