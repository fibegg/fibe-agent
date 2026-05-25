import { describe, test, expect, beforeEach, afterEach, vi, Mock } from 'bun:test';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { UploadsService } from './uploads.service';
import { contentTypeFromFilename } from './uploads-handler';
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

vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(),
  };
});

function mockImageMagickConversion(output: Buffer): void {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { end: Mock<(input: Buffer) => void> };
    kill: Mock<(signal: string) => void>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    end: vi.fn(() => {
      queueMicrotask(() => {
        child.stdout.emit('data', output);
        child.emit('close', 0);
      });
    }),
  };
  child.kill = vi.fn();
  (spawn as unknown as Mock<typeof spawn>).mockReturnValue(child as never);
}

describe('UploadsService', () => {
  let dataDir: string;
  const config = {
    getDataDir: () => '',
    getConversationDataDir: () => '',
    getEncryptionKey: () => undefined,
    getOcrConversionMaxBytes: () => 10 * 1024 * 1024,
    getOcrConversionMaxOutputBytes: () => 25 * 1024 * 1024,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dataDir = mkdtempSync(join(tmpdir(), 'uploads-'));
    (config as { getDataDir: () => string; getConversationDataDir: () => string }).getDataDir = () => dataDir;
    (config as { getDataDir: () => string; getConversationDataDir: () => string }).getConversationDataDir = () => dataDir;
    config.getOcrConversionMaxBytes = () => 10 * 1024 * 1024;
    config.getOcrConversionMaxOutputBytes = () => 25 * 1024 * 1024;
  });

  afterEach(() => {
    delete process.env.FIBE_OCR_CONVERSION_MAX_BYTES;
    delete process.env.FIBE_OCR_CONVERSION_MAX_OUTPUT_BYTES;
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

  test('contentTypeFromFilename maps retrievable upload extensions', () => {
    expect(contentTypeFromFilename('archive.zip')).toBe('application/zip');
    expect(contentTypeFromFilename('screenshot.PNG')).toBe('image/png');
    expect(contentTypeFromFilename('notes.txt')).toBe('text/plain');
    expect(contentTypeFromFilename('unknown.bin')).toBe('application/octet-stream');
  });

  describe('extractImageInfo', () => {
    test('supports OCR for native formats and bounded convertible formats', () => {
      const service = new UploadsService(config as never);
      expect(service.supportsImageOcr('screenshot.png')).toBe(true);
      expect(service.supportsImageOcr('photo.jpeg')).toBe(true);
      expect(service.supportsImageOcr('photo.webp')).toBe(true);
      expect(service.supportsImageOcr('scan.tiff')).toBe(true);
      expect(service.supportsImageOcr('animation.gif')).toBe(false);
    });

    test('returns null if path does not exist', async () => {
      const service = new UploadsService(config as never);
      expect(await service.extractImageInfo('doesnotexist.jpg')).toBeNull();
    });

    test('returns null if not an image extension', async () => {
      const service = new UploadsService(config as never);
      const filename = await service.saveAudioFromBuffer(Buffer.from('x'), 'audio/webm');
      expect(await service.extractImageInfo(filename)).toBeNull();
    });

    test('converts small unsupported image formats to PNG before OCR', async () => {
      const service = new UploadsService(config as never);
      const dataUrl = 'data:image/webp;base64,' + Buffer.from('dummy').toString('base64');
      const filename = await service.saveImage(dataUrl);
      mockImageMagickConversion(Buffer.from('converted-png'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sizeOf as unknown as Mock<() => any>).mockReturnValue({ width: 20, height: 10, type: 'png' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Tesseract.recognize as unknown as Mock<() => any>).mockResolvedValue({ data: { text: 'converted OCR' } });

      expect(filename).toMatch(/\.webp$/);
      expect(await service.extractImageInfo(filename)).toEqual({ text: 'converted OCR', width: 20, height: 10, format: 'png' });
      expect(spawn).toHaveBeenCalledWith('magick', ['-', '-auto-orient', '-strip', 'png:-'], expect.any(Object));
      expect(Tesseract.recognize).toHaveBeenCalledWith(
        Buffer.from('converted-png'),
        'eng',
        expect.objectContaining({ workerBlobURL: false }),
      );
    });

    test('does not convert unsupported image formats above the size limit', async () => {
      config.getOcrConversionMaxBytes = () => 4;
      const service = new UploadsService(config as never);
      const dataUrl = 'data:image/webp;base64,' + Buffer.from('dummy').toString('base64');
      const filename = await service.saveImage(dataUrl);
      expect(await service.extractImageInfo(filename)).toBeNull();
      expect(spawn).not.toHaveBeenCalled();
      expect(sizeOf).not.toHaveBeenCalled();
      expect(Tesseract.recognize).not.toHaveBeenCalled();
    });

    test('does not OCR converted images above the output size limit', async () => {
      config.getOcrConversionMaxOutputBytes = () => 4;
      const service = new UploadsService(config as never);
      const dataUrl = 'data:image/webp;base64,' + Buffer.from('dummy').toString('base64');
      const filename = await service.saveImage(dataUrl);
      mockImageMagickConversion(Buffer.from('too-large'));
      expect(await service.extractImageInfo(filename)).toBeNull();
      expect(spawn).toHaveBeenCalled();
      expect(sizeOf).not.toHaveBeenCalled();
      expect(Tesseract.recognize).not.toHaveBeenCalled();
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
      expect(Tesseract.recognize).toHaveBeenCalledWith(
        expect.any(Buffer),
        'eng',
        expect.objectContaining({
          workerBlobURL: false,
          workerPath: expect.stringContaining('worker-script/node/index.js'),
        }),
      );

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
