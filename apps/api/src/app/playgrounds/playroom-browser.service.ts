import { readdir, lstat, stat, symlink, unlink, readlink, mkdir, access } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

/** Hidden (dot-prefixed) entries that should still appear when browsing. */
const VISIBLE_HIDDEN = new Set<string>(['.claude']);

export interface BrowseEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
}

/** Path-traversal guard — throws BadRequestException when abs escapes root. */
function assertSafePath(root: string, abs: string): string {
  const rel = relative(root, abs);
  if (rel.startsWith('..') || rel.startsWith('/')) {
    throw new BadRequestException('Invalid path');
  }
  return rel;
}

/** Returns true when the path exists (any type). */
async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class PlayroomBrowserService {
  constructor(private readonly config: ConfigService) {}

  /** List entries under PLAYROOMS_ROOT at the given relative path. */
  async browse(relPath = ''): Promise<BrowseEntry[]> {
    const root = resolve(this.config.getPlayroomsRoot());
    const absPath = relPath ? resolve(root, relPath) : root;
    const rel = assertSafePath(root, absPath);

    if (!(await pathExists(absPath))) {
      throw new NotFoundException(`Path not found: ${relPath || '/'}`);
    }

    const raw = await readdir(absPath, { withFileTypes: true }).catch(() => {
      throw new NotFoundException(`Cannot read: ${relPath || '/'}`);
    });

    const dirs: BrowseEntry[] = [];
    const files: BrowseEntry[] = [];

    for (const e of raw) {
      const name = String(e.name);
      if (name.startsWith('.') && !VISIBLE_HIDDEN.has(name)) continue;

      const childRel = rel ? `${rel}/${name}` : name;
      const childAbs = resolve(absPath, name);

      if (e.isSymbolicLink()) {
        try {
          const targetStat = await stat(childAbs);
          if (targetStat.isDirectory()) {
            dirs.push({ name, path: childRel, type: 'symlink' });
          } else {
            files.push({ name, path: childRel, type: 'file' });
          }
        } catch {
          // Broken symlink — skip
        }
      } else if (e.isDirectory()) {
        dirs.push({ name, path: childRel, type: 'directory' });
      } else if (e.isFile()) {
        files.push({ name, path: childRel, type: 'file' });
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return [...dirs, ...files];
  }

  /**
   * Create (or replace) the PLAYGROUNDS_DIR symlink pointing at
   * <PLAYROOMS_ROOT>/<relPath>.
   *
   * Throws:
   *  - BadRequestException  if relPath is empty / invalid / PLAYGROUNDS_DIR is a real dir
   *  - NotFoundException    if the target path does not exist
   */
  async linkPlayground(relPath: string): Promise<{ linkedPath: string }> {
    if (!relPath?.trim()) {
      throw new BadRequestException('Path is required');
    }

    const root = resolve(this.config.getPlayroomsRoot());
    const target = resolve(root, relPath);
    assertSafePath(root, target);

    if (!(await pathExists(target))) {
      throw new NotFoundException(`Target not found: ${relPath}`);
    }

    const playgroundDir = resolve(this.config.getPlaygroundsDir());

    // Ensure parent directory exists
    await mkdir(dirname(playgroundDir), { recursive: true });

    // Clean up whatever is at playgroundDir
    try {
      const st = await lstat(playgroundDir);
      if (st.isDirectory() && !st.isSymbolicLink()) {
        throw new BadRequestException(
          `Cannot replace '${playgroundDir}': it is a real directory. Remove it manually first.`,
        );
      }
      await unlink(playgroundDir);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw err; // re-throw BadRequestException or unexpected OS errors
    }

    try {
      await symlink(target, playgroundDir, 'dir');
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      throw new BadRequestException(
        `Failed to create symlink: ${e.message} (code: ${e.code ?? 'unknown'})`,
      );
    }

    return { linkedPath: target };
  }

  /** Returns the symlink target of PLAYGROUNDS_DIR relative to PLAYROOMS_ROOT, or null. */
  async getCurrentLink(): Promise<string | null> {
    const playgroundDir = resolve(this.config.getPlaygroundsDir());
    try {
      if (!(await lstat(playgroundDir)).isSymbolicLink()) return null;
      const target = await readlink(playgroundDir);
      const absTarget = resolve(dirname(playgroundDir), target);
      const root = resolve(this.config.getPlayroomsRoot());
      const rel = relative(root, absTarget);
      return rel.startsWith('..') ? target : rel;
    } catch {
      return null;
    }
  }
}
