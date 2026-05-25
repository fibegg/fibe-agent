import { Injectable, Logger, Optional } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '../config/config.service';
import { ConversationManagerService, DEFAULT_CONVERSATION_ID } from '../conversation/conversation-manager.service';
import { extFromMimetype } from './uploads-handler';
import sizeOf from 'image-size';
import Tesseract from 'tesseract.js';

export interface ImageInfo {
  text: string;
  width?: number;
  height?: number;
  format?: string;
}

const DATA_URL_REGEX = /^data:([^;]+);base64,(.+)$/;
const runtimeRequire = createRequire(__filename);
const OCR_NATIVE_IMAGE_REGEX = /\.(jpe?g|png)$/i;
const OCR_CONVERTIBLE_IMAGE_REGEX = /\.(avif|bmp|heic|heif|tiff?|webp)$/i;
const OCR_CONVERSION_TIMEOUT_MS = 10_000;

function resolveTesseractWorkerPath(): string {
  const distWorkerPath = join(__dirname, 'tesseract', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js');
  return existsSync(distWorkerPath)
    ? distWorkerPath
    : runtimeRequire.resolve('tesseract.js/src/worker-script/node/index.js');
}

const TESSERACT_RECOGNIZE_OPTIONS = {
  logger: () => void 0,
  workerBlobURL: false,
  workerPath: resolveTesseractWorkerPath(),
};

function convertImageWith(command: string, input: Buffer, maxOutputBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['-', '-auto-orient', '-strip', 'png:-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let byteCount = 0;
    let stderr = '';
    let settled = false;

    const finish = (error?: Error, output?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
      } else {
        resolve(output ?? Buffer.alloc(0));
      }
    };

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`Image conversion timed out after ${OCR_CONVERSION_TIMEOUT_MS}ms`));
    }, OCR_CONVERSION_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      byteCount += chunk.length;
      if (byteCount > maxOutputBytes) {
        child.kill('SIGKILL');
        finish(new Error('Converted image exceeded OCR conversion output limit'));
        return;
      }
      chunks.push(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4096) stderr += chunk.toString();
    });

    child.on('error', (error) => finish(error));
    child.on('close', (code) => {
      if (code === 0) {
        finish(undefined, Buffer.concat(chunks));
      } else {
        finish(new Error(`Image conversion failed with code ${code}: ${stderr.trim()}`));
      }
    });

    child.stdin.end(input);
  });
}

async function convertImageToPng(input: Buffer, maxOutputBytes: number): Promise<Buffer> {
  try {
    return await convertImageWith('magick', input, maxOutputBytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return convertImageWith('convert', input, maxOutputBytes);
  }
}

function audioExtFromMime(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  return 'webm';
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly conversationManager?: ConversationManagerService,
  ) {}

  getUploadsDir(conversationId = DEFAULT_CONVERSATION_ID): string {
    return join(this.conversationDataDir(conversationId), 'uploads');
  }

  async saveImage(dataUrl: string, conversationId = DEFAULT_CONVERSATION_ID): Promise<string> {
    if (!dataUrl.startsWith('data:')) return dataUrl;
    this.ensureUploadsDir(conversationId);
    const match = dataUrl.match(DATA_URL_REGEX);
    const ext = match?.[1]?.startsWith('image/')
      ? match[1].replace('image/', '') === 'jpeg'
        ? 'jpg'
        : match[1].replace('image/', '')
      : 'png';
    const base64 = match?.[2] ?? dataUrl.replace(/^data:[^;]+;base64,/, '');
    return this.writeFile(ext, Buffer.from(base64, 'base64'), conversationId);
  }

  async saveAudio(dataUrl: string, conversationId = DEFAULT_CONVERSATION_ID): Promise<string> {
    this.ensureUploadsDir(conversationId);
    const match = dataUrl.match(DATA_URL_REGEX);
    const mime = match?.[1] ?? 'audio/webm';
    const base64 = match?.[2] ?? dataUrl.replace(/^data:[^;]+;base64,/, '');
    const ext = audioExtFromMime(mime);
    return this.writeFile(ext, Buffer.from(base64, 'base64'), conversationId);
  }

  async saveAudioFromBuffer(buffer: Buffer, mimeType: string, conversationId = DEFAULT_CONVERSATION_ID): Promise<string> {
    this.ensureUploadsDir(conversationId);
    const ext = audioExtFromMime(mimeType);
    return this.writeFile(ext, buffer, conversationId);
  }

  async saveFileFromBuffer(buffer: Buffer, mimetype: string, conversationId = DEFAULT_CONVERSATION_ID): Promise<string> {
    this.ensureUploadsDir(conversationId);
    const ext = extFromMimetype(mimetype);
    return this.writeFile(ext, buffer, conversationId);
  }

  getPath(filename: string, conversationId = DEFAULT_CONVERSATION_ID): string | null {
    if (!this.isSafeFilename(filename)) return null;
    const path = join(this.getUploadsDir(conversationId), filename);
    return existsSync(path) ? path : null;
  }

  supportsImageOcr(filename: string): boolean {
    return OCR_NATIVE_IMAGE_REGEX.test(filename) || OCR_CONVERTIBLE_IMAGE_REGEX.test(filename);
  }

  async extractImageInfo(filename: string, conversationId = DEFAULT_CONVERSATION_ID): Promise<ImageInfo | null> {
    const p = this.getPath(filename, conversationId);
    if (!p) return null;

    if (!this.supportsImageOcr(filename)) {
      return null;
    }

    const metaPath = p + '.meta.json';
    if (existsSync(metaPath)) {
      try {
        const cached = await readFile(metaPath, 'utf8');
        return JSON.parse(cached);
      } catch (e) {
        this.logger.warn(`Failed to read cached metadata for ${filename}`, e);
      }
    }

    try {
      const buffer = await this.readImageBufferForOcr(filename, p);
      if (!buffer) return null;

      const metadata = sizeOf(buffer);
      const { data } = await Tesseract.recognize(buffer, 'eng', TESSERACT_RECOGNIZE_OPTIONS);
      const info: ImageInfo = {
        text: data?.text?.trim() || '',
        width: metadata?.width,
        height: metadata?.height,
        format: metadata?.type,
      };
      await writeFile(metaPath, JSON.stringify(info));
      return info;
    } catch (e) {
      this.logger.warn(`Failed to extract image info for ${filename}`, e);
      return null;
    }
  }

  private async readImageBufferForOcr(filename: string, path: string): Promise<Buffer | null> {
    if (OCR_NATIVE_IMAGE_REGEX.test(filename)) {
      return readFile(path);
    }

    if (!OCR_CONVERTIBLE_IMAGE_REGEX.test(filename)) {
      return null;
    }

    const { size } = await stat(path);
    if (size > this.config.getOcrConversionMaxBytes()) {
      return null;
    }

    try {
      return await convertImageToPng(await readFile(path), this.config.getOcrConversionMaxOutputBytes());
    } catch (e) {
      this.logger.warn(`Failed to convert image for OCR for ${filename}`, e);
      return null;
    }
  }

  private ensureUploadsDir(conversationId: string): void {
    const dir = this.getUploadsDir(conversationId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  private async writeFile(ext: string, buffer: Buffer, conversationId: string): Promise<string> {
    const filename = `${randomUUID()}.${ext}`;
    await writeFile(join(this.getUploadsDir(conversationId), filename), buffer);
    return filename;
  }

  private conversationDataDir(conversationId: string): string {
    if (!this.conversationManager || conversationId === DEFAULT_CONVERSATION_ID) {
      return this.config.getConversationDataDir();
    }
    return this.conversationManager.dataDirFor(conversationId || DEFAULT_CONVERSATION_ID);
  }

  private isSafeFilename(filename: string): boolean {
    return (
      filename.length > 0 &&
      !filename.includes('..') &&
      !filename.includes('/') &&
      !filename.includes('\\')
    );
  }
}
