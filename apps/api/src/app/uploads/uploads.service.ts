import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '../config/config.service';

@Injectable()
export class UploadsService {
  constructor(private readonly config: ConfigService) {}

  getUploadsDir(): string {
    return join(this.config.getDataDir(), 'uploads');
  }

  saveImage(dataUrl: string): string {
    const dir = this.getUploadsDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    const ext = match?.[1]?.startsWith('image/')
      ? match[1].replace('image/', '') === 'jpeg'
        ? 'jpg'
        : match[1].replace('image/', '')
      : 'png';
    const base64 = match?.[2] ?? dataUrl.replace(/^data:[^;]+;base64,/, '');
    const filename = `${randomUUID()}.${ext}`;
    const path = join(dir, filename);
    writeFileSync(path, Buffer.from(base64, 'base64'));
    return filename;
  }

  getPath(filename: string): string | null {
    if (!this.isSafeFilename(filename)) return null;
    const path = join(this.getUploadsDir(), filename);
    return existsSync(path) ? path : null;
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
