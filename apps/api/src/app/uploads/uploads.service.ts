import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '../config/config.service';
import { extFromMimetype } from './uploads-handler';

const DATA_URL_REGEX = /^data:([^;]+);base64,(.+)$/;

function audioExtFromMime(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  return 'webm';
}

@Injectable()
export class UploadsService {
  constructor(private readonly config: ConfigService) {}

  getUploadsDir(): string {
    return join(this.config.getConversationDataDir(), 'uploads');
  }

  async saveImage(dataUrl: string): Promise<string> {
    this.ensureUploadsDir();
    const match = dataUrl.match(DATA_URL_REGEX);
    const ext = match?.[1]?.startsWith('image/')
      ? match[1].replace('image/', '') === 'jpeg'
        ? 'jpg'
        : match[1].replace('image/', '')
      : 'png';
    const base64 = match?.[2] ?? dataUrl.replace(/^data:[^;]+;base64,/, '');
    return this.writeFile(ext, Buffer.from(base64, 'base64'));
  }

  async saveAudio(dataUrl: string): Promise<string> {
    this.ensureUploadsDir();
    const match = dataUrl.match(DATA_URL_REGEX);
    const mime = match?.[1] ?? 'audio/webm';
    const base64 = match?.[2] ?? dataUrl.replace(/^data:[^;]+;base64,/, '');
    const ext = audioExtFromMime(mime);
    return this.writeFile(ext, Buffer.from(base64, 'base64'));
  }

  async saveAudioFromBuffer(buffer: Buffer, mimeType: string): Promise<string> {
    this.ensureUploadsDir();
    const ext = audioExtFromMime(mimeType);
    return this.writeFile(ext, buffer);
  }

  async saveFileFromBuffer(buffer: Buffer, mimetype: string): Promise<string> {
    this.ensureUploadsDir();
    const ext = extFromMimetype(mimetype);
    return this.writeFile(ext, buffer);
  }

  getPath(filename: string): string | null {
    if (!this.isSafeFilename(filename)) return null;
    const path = join(this.getUploadsDir(), filename);
    return existsSync(path) ? path : null;
  }

  private ensureUploadsDir(): void {
    const dir = this.getUploadsDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  private async writeFile(ext: string, buffer: Buffer): Promise<string> {
    const filename = `${randomUUID()}.${ext}`;
    await writeFile(join(this.getUploadsDir(), filename), buffer);
    return filename;
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
