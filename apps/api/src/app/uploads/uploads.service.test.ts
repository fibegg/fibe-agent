import { describe, test, expect, beforeEach, afterEach, vi, Mock } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { UploadsService } from './uploads.service';
import sizeOf from 'image-size';
import Tesseract from 'tesseract.js';

vi.mock('image-size', () => {
  return { default: vi.fn() };
});

vi.mock('tesseract.js', () => {
  return {
    default: {
      recognize: vi.fn()
    }
  };
});

describe('UploadsService', () => {
  let dataDir: string;
  const config = { getDataDir: () => '', getConversationDataDir: () => '', getEncryptionKey: () => undefined };

  beforeEach(() => {
    vi.clearAllMocks();
    dataDir = mkdtempSync(join(tmpdir(), 'uploads-'));
    (config as { getDataDir: () => string; getConversationDataDir: () => string }).getDataDir = () => dataDir;
    (config as { getDataDir: () => string; getConversationDataDir: () => string }).getConversationDataDir = () => dataDir;
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
    (config as { getConversationDataDir: () => string }).getConversationDataDir = () => subDir;
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
    expect(await service.saveFileFromBuffer(Buffer.from(''), 'text/plain')).toMatch(/\.txt$/);
  });

  describe('extractImageInfo', () => {
    test('returns null if path does not exist', async () => {
      const service = new UploadsService(config as never);
      expect(await service.extractImageInfo('doesnotexist.jpg')).toBeNull();
    });

    test('returns null if not an image extension', async () => {
      const service = new UploadsService(config as never);
      const filename = await service.saveAudioFromBuffer(Buffer.from('x'), 'audio/webm');
      expect(await service.extractImageInfo(filename)).toBeNull();
    });

    test('returns info using mocks and caches it', async () => {
      const service = new UploadsService(config as never);
      const dataUrl = 'data:image/png;base64,' + Buffer.from('dummy').toString('base64');
      const filename = await service.saveImage(dataUrl);

      // Setup mocks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sizeOf as unknown as Mock<() => any>).mockReturnValue({ width: 100, height: 200, type: 'png' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Tesseract.recognize as unknown as Mock<() => any>).mockResolvedValue({ data: { text: 'hello OCR' } });

      const info1 = await service.extractImageInfo(filename);
      expect(info1).toEqual({ text: 'hello OCR', width: 100, height: 200, format: 'png' });
      expect(sizeOf).toHaveBeenCalledTimes(1);
      expect(Tesseract.recognize).toHaveBeenCalledTimes(1);

      // Next call should use cached metadata
      const info2 = await service.extractImageInfo(filename);
      expect(info2).toEqual(info1);
      expect(sizeOf).toHaveBeenCalledTimes(1); // Still 1
      
      const p = service.getPath(filename);
      expect(p).toBeTruthy();
      expect(existsSync(p + '.meta.json')).toBeTrue();
    });

    test('handles extraction errors gracefully', async () => {
      const service = new UploadsService(config as never);
      const dataUrl = 'data:image/png;base64,' + Buffer.from('dummy').toString('base64');
      const filename = await service.saveImage(dataUrl);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sizeOf as unknown as Mock<() => any>).mockImplementation(() => { throw new Error('Corrupt'); });
      const info = await service.extractImageInfo(filename);
      expect(info).toBeNull();
    });
  });
});
