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

  /** List entries explicitly via playgrounds-explorer. */
  async browse(relPath = ''): Promise<BrowseEntry[]> {
    if (relPath) return []; // Flattened UI workflow doesn't browse subdirectories

    try {
      const { execFile } = require('child_process');
      const util = require('util');
      const execFileAsync = util.promisify(execFile);
      const scriptPath = resolve(process.cwd(), 'playgrounds-explorer');
      const targetBase = resolve(this.config.getPlayroomsRoot(), 'playgrounds');
      
      const { stdout } = await execFileAsync('node', [scriptPath], {
        env: { ...process.env, PLAYROOMS_ROOT: targetBase }
      });
      const lines = stdout.split('\n').filter((l: string) => l.trim().length > 0);
      
      const entries: BrowseEntry[] = [];
      for (const line of lines) {
         const [path, name] = line.split('|');
         if (path) {
             entries.push({ name: name || path, path, type: 'directory' });
         }
      }
      return entries;
    } catch (e) {
      throw new NotFoundException(`Cannot execute Playgrounds Explorer.`);
    }
  }

  /**
   * Run playgrounds-explorer --link to map the target services to /app/playground.
   *
   * Throws:
   *  - BadRequestException  if relPath is empty / invalid
   *  - NotFoundException    if the target path does not exist
   */
  async linkPlayground(relPath: string): Promise<{ linkedPath: string }> {
    if (!relPath?.trim()) {
      throw new BadRequestException('Path is required');
    }

    const root = resolve(this.config.getPlayroomsRoot(), 'playgrounds');
    const target = resolve(root, relPath);
    assertSafePath(root, target);

    if (!(await pathExists(target))) {
      throw new NotFoundException(`Target not found: ${relPath}`);
    }

    try {
      const { execFile } = require('child_process');
      const util = require('util');
      const execFileAsync = util.promisify(execFile);
      
      const scriptPath = resolve(process.cwd(), 'playgrounds-explorer');
      const linkDir = resolve(this.config.getPlaygroundsDir());
      const targetBase = resolve(this.config.getPlayroomsRoot(), 'playgrounds');
      
      await execFileAsync('node', [scriptPath, relPath, '--link', '--link-dir', linkDir], {
        env: { ...process.env, PLAYROOMS_ROOT: targetBase }
      });
      
    } catch (err: unknown) {
      const e = err as Error;
      throw new BadRequestException(
        `Failed to link playground via explorer: ${e.message}`,
      );
    }

    return { linkedPath: target };
  }

  /** Returns the name of the playground currently active in /app/playground, or null. */
  async getCurrentLink(): Promise<string | null> {
    const playgroundDir = resolve(this.config.getPlaygroundsDir());
    const stateFile = resolve(playgroundDir, '.current_playground');
    try {
      const content = await require('fs/promises').readFile(stateFile, 'utf8');
      return content ? content.trim() : null;
    } catch {
      return null;
    }
  }
}
