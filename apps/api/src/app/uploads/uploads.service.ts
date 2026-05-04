import { Injectable, Logger, Optional } from '@nestjs/common';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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

  async extractImageInfo(filename: string, conversationId = DEFAULT_CONVERSATION_ID): Promise<ImageInfo | null> {
    const p = this.getPath(filename, conversationId);
    if (!p) return null;

    if (!/\.(jpg|jpeg|png)$/i.test(filename)) {
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
      const buffer = await readFile(p);
      const metadata = sizeOf(buffer);
      const { data } = await Tesseract.recognize(buffer, 'eng', { logger: () => void 0 });
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
