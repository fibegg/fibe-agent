import { readdir, lstat, symlink, unlink, readlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

export interface BrowseEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

/** Reusable path-traversal guard. */
function assertSafePath(root: string, abs: string): string {
  const rel = relative(root, abs);
  if (rel.startsWith('..') || rel.startsWith('/')) {
    throw new BadRequestException('Invalid path');
  }
  return rel;
}

@Injectable()
export class PlayroomBrowserService {
  constructor(private readonly config: ConfigService) {}

  /** List entries under PLAYROOMS_ROOT at the given relative path. */
  async browse(relPath = ''): Promise<BrowseEntry[]> {
    const root = resolve(this.config.getPlayroomsRoot());
    const absPath = relPath ? resolve(root, relPath) : root;
    const rel = assertSafePath(root, absPath);

    if (!existsSync(absPath)) {
      throw new NotFoundException(`Path not found: ${relPath || '/'}`);
    }

    const raw = await readdir(absPath, { withFileTypes: true }).catch(() => {
      throw new NotFoundException(`Cannot read: ${relPath || '/'}`);
    });

    const dirs: BrowseEntry[] = [];
    const files: BrowseEntry[] = [];

    for (const e of raw) {
      const name = typeof e.name === 'string' ? e.name : String(e.name);
      if (name.startsWith('.')) continue;
      const childRel = rel ? `${rel}/${name}` : name;
      if (e.isDirectory()) {
        dirs.push({ name, path: childRel, type: 'directory' });
      } else if (e.isFile() || e.isSymbolicLink()) {
        files.push({ name, path: childRel, type: 'file' });
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return [...dirs, ...files];
  }

  /** Create symlink: PLAYGROUNDS_DIR → <PLAYROOMS_ROOT>/<relPath>. Replaces existing symlink. */
  async linkPlayground(relPath: string): Promise<{ linkedPath: string }> {
    if (!relPath?.trim()) {
      throw new BadRequestException('Path is required');
    }

    const root = resolve(this.config.getPlayroomsRoot());
    const target = resolve(root, relPath);
    assertSafePath(root, target);

    if (!existsSync(target)) {
      throw new NotFoundException(`Target not found: ${relPath}`);
    }

    const playgroundDir = resolve(this.config.getPlaygroundsDir());

    // Remove existing symlink if present
    try {
      if ((await lstat(playgroundDir)).isSymbolicLink()) {
        await unlink(playgroundDir);
      }
    } catch { /* doesn't exist — fine */ }

    await symlink(target, playgroundDir, 'dir');
    return { linkedPath: target };
  }

  /** Returns the symlink target of PLAYGROUNDS_DIR relative to PLAYROOMS_ROOT, or null. */
  async getCurrentLink(): Promise<string | null> {
    const playgroundDir = resolve(this.config.getPlaygroundsDir());
    try {
      if (!(await lstat(playgroundDir)).isSymbolicLink()) return null;
      const target = await readlink(playgroundDir);
      const absTarget = resolve(playgroundDir, '..', target);
      const root = resolve(this.config.getPlayroomsRoot());
      const rel = relative(root, absTarget);
      return rel.startsWith('..') ? target : rel;
    } catch {
      return null;
    }
  }
}
