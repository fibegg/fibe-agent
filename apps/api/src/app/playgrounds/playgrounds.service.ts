import { readdir, readFile, stat } from 'node:fs/promises';
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

  async getTree(): Promise<PlaygroundEntry[]> {
    return this.readDir(this.config.getPlaygroundsDir(), '');
  }

  async getFileContent(relativePath: string): Promise<string> {
    const base = resolve(this.config.getPlaygroundsDir());
    const absPath = resolve(base, relativePath);
    const rel = relative(base, absPath);
    if (rel.startsWith('..') || absPath === base || pathInIgnoredDir(rel)) {
      throw new NotFoundException('File not found');
    }
    let st: Awaited<ReturnType<typeof stat>>;
    try {
      st = await stat(absPath);
    } catch {
      throw new NotFoundException('File not found');
    }
    if (!st.isFile()) {
      throw new NotFoundException('File not found');
    }
    return readFile(absPath, 'utf-8');
  }

  async getFolderFileContents(
    relativePath: string
  ): Promise<{ path: string; content: string }[]> {
    const base = resolve(this.config.getPlaygroundsDir());
    const absPath = resolve(base, relativePath);
    const rel = relative(base, absPath);
    if (rel.startsWith('..') || absPath === base || pathInIgnoredDir(rel)) {
      throw new NotFoundException('Folder not found');
    }
    let st: Awaited<ReturnType<typeof stat>>;
    try {
      st = await stat(absPath);
    } catch {
      throw new NotFoundException('Folder not found');
    }
    if (!st.isDirectory()) {
      throw new NotFoundException('Folder not found');
    }
    return this.collectFileContents(absPath, rel);
  }

  private async collectFileContents(
    absPath: string,
    relPath: string
  ): Promise<{ path: string; content: string }[]> {
    if (IGNORED_NAMES.has(basename(absPath))) return [];
    const result: { path: string; content: string }[] = [];
    let entries: { name: string | Buffer; isFile: () => boolean; isDirectory: () => boolean }[];
    try {
      entries = await readdir(absPath, { withFileTypes: true });
    } catch {
      return [];
    }
    for (const e of entries) {
      const name = typeof e.name === 'string' ? e.name : String(e.name);
      if (name.startsWith(HIDDEN_PREFIX) || IGNORED_NAMES.has(name)) continue;
      const childRel = relPath ? `${relPath}/${name}` : name;
      const childAbs = join(absPath, name);
      if (e.isFile()) {
        try {
          const content = await readFile(childAbs, 'utf-8');
          result.push({ path: childRel, content });
        } catch {
          /* skip unreadable files */
        }
      } else if (e.isDirectory()) {
        const sub = await this.collectFileContents(childAbs, childRel);
        result.push(...sub);
      }
    }
    return result;
  }

  private async readDir(absPath: string, relativePath: string): Promise<PlaygroundEntry[]> {
    if (IGNORED_NAMES.has(basename(absPath))) return [];
    try {
      const entries = await readdir(absPath, { withFileTypes: true });
      const result: PlaygroundEntry[] = [];
      const dirs: { name: string; abs: string; rel: string }[] = [];
      const files: { name: string; rel: string }[] = [];
      for (const e of entries) {
        const name = typeof e.name === 'string' ? e.name : String(e.name);
        if (name.startsWith(HIDDEN_PREFIX) || IGNORED_NAMES.has(name)) continue;
        const rel = relativePath ? `${relativePath}/${name}` : name;
        if (e.isDirectory()) {
          dirs.push({ name, abs: join(absPath, name), rel });
        } else if (e.isFile()) {
          files.push({ name, rel });
        }
      }
      dirs.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));
      for (const d of dirs) {
        result.push({
          name: d.name,
          path: d.rel,
          type: 'directory',
          children: await this.readDir(d.abs, d.rel),
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
