import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

export interface PlaygroundEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: PlaygroundEntry[];
}

const HIDDEN_PREFIX = '.';

@Injectable()
export class PlaygroundsService {
  constructor(private readonly config: ConfigService) {}

  getTree(): PlaygroundEntry[] {
    return this.readDir(this.config.getPlaygroundsDir(), '');
  }

  private readDir(absPath: string, relativePath: string): PlaygroundEntry[] {
    try {
      const entries = readdirSync(absPath, { withFileTypes: true });
      const result: PlaygroundEntry[] = [];
      const dirs: { name: string; abs: string; rel: string }[] = [];
      const files: { name: string; rel: string }[] = [];
      for (const e of entries) {
        if (e.name.startsWith(HIDDEN_PREFIX)) continue;
        const rel = relativePath ? `${relativePath}/${e.name}` : e.name;
        if (e.isDirectory()) {
          dirs.push({ name: e.name, abs: join(absPath, e.name), rel });
        } else if (e.isFile()) {
          files.push({ name: e.name, rel });
        }
      }
      dirs.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));
      for (const d of dirs) {
        result.push({
          name: d.name,
          path: d.rel,
          type: 'directory',
          children: this.readDir(d.abs, d.rel),
        });
      }
      for (const f of files) {
        result.push({ name: f.name, path: f.rel, type: 'file' });
      }
      return result;
    } catch {
      return [];
    }
  }
}
