import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative, basename } from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

export interface PlaygroundEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: PlaygroundEntry[];
}

const HIDDEN_PREFIX = '.';

const IGNORED_NAMES = new Set<string>(['node_modules', '.git']);

function pathInIgnoredDir(relPath: string): boolean {
  const segments = relPath.replace(/\\/g, '/').split('/');
  return segments.some((seg) => IGNORED_NAMES.has(seg));
}

@Injectable()
export class PlaygroundsService {
  constructor(private readonly config: ConfigService) {}

  getTree(): PlaygroundEntry[] {
    return this.readDir(this.config.getPlaygroundsDir(), '');
  }

  getFileContent(relativePath: string): string {
    const base = resolve(this.config.getPlaygroundsDir());
    const absPath = resolve(base, relativePath);
    const rel = relative(base, absPath);
    if (rel.startsWith('..') || absPath === base || pathInIgnoredDir(rel)) {
      throw new NotFoundException('File not found');
    }
    if (!existsSync(absPath) || !statSync(absPath).isFile()) {
      throw new NotFoundException('File not found');
    }
    return readFileSync(absPath, 'utf-8');
  }

  getFolderFileContents(relativePath: string): { path: string; content: string }[] {
    const base = resolve(this.config.getPlaygroundsDir());
    const absPath = resolve(base, relativePath);
    const rel = relative(base, absPath);
    if (rel.startsWith('..') || absPath === base || pathInIgnoredDir(rel)) {
      throw new NotFoundException('Folder not found');
    }
    if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
      throw new NotFoundException('Folder not found');
    }
    return this.collectFileContents(absPath, rel);
  }

  private collectFileContents(absPath: string, relPath: string): { path: string; content: string }[] {
    if (IGNORED_NAMES.has(basename(absPath))) return [];
    const result: { path: string; content: string }[] = [];
    const entries = readdirSync(absPath, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith(HIDDEN_PREFIX) || IGNORED_NAMES.has(e.name)) continue;
      const childRel = relPath ? `${relPath}/${e.name}` : e.name;
      const childAbs = join(absPath, e.name);
      if (e.isFile()) {
        try {
          result.push({ path: childRel, content: readFileSync(childAbs, 'utf-8') });
        } catch {
          /* skip unreadable files */
        }
      } else if (e.isDirectory()) {
        result.push(...this.collectFileContents(childAbs, childRel));
      }
    }
    return result;
  }

  private readDir(absPath: string, relativePath: string): PlaygroundEntry[] {
    if (IGNORED_NAMES.has(basename(absPath))) return [];
    try {
      const entries = readdirSync(absPath, { withFileTypes: true });
      const result: PlaygroundEntry[] = [];
      const dirs: { name: string; abs: string; rel: string }[] = [];
      const files: { name: string; rel: string }[] = [];
      for (const e of entries) {
        if (e.name.startsWith(HIDDEN_PREFIX) || IGNORED_NAMES.has(e.name)) continue;
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
