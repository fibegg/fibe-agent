import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { join, resolve, relative, basename } from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { loadGitignore, type GitignoreFilter } from '../gitignore-utils';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface PlaygroundEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  mtime?: number;
  children?: PlaygroundEntry[];
  gitStatus?: 'modified' | 'untracked' | 'deleted' | 'added' | 'renamed';
}

const HIDDEN_PREFIX = '.';

const IGNORED_NAMES = new Set<string>(['node_modules', '.git']);

/** Hidden (dot-prefixed) directories that should still appear in the file tree. */
const VISIBLE_HIDDEN = new Set<string>(['.claude']);

function pathInIgnoredDir(relPath: string): boolean {
  const segments = relPath.replace(/\\/g, '/').split('/');
  return segments.some((seg) => IGNORED_NAMES.has(seg));
}

@Injectable()
export class PlaygroundsService {
  constructor(private readonly config: ConfigService) {}

  async getTree(): Promise<PlaygroundEntry[]> {
    const ig = await loadGitignore(this.config.getPlaygroundsDir());
    const statuses = await this.getGitStatuses(this.config.getPlaygroundsDir());
    return this.readDir(this.config.getPlaygroundsDir(), '', ig, statuses);
  }

  async getStats(): Promise<{ fileCount: number; totalLines: number }> {
    const ig = await loadGitignore(this.config.getPlaygroundsDir());
    return this.countStats(this.config.getPlaygroundsDir(), ig);
  }

  private async countStats(absPath: string, parentIg: GitignoreFilter): Promise<{ fileCount: number; totalLines: number }> {
    let fileCount = 0;
    let totalLines = 0;
    try {
      const ig = await loadGitignore(absPath, parentIg);
      const entries = await readdir(absPath, { withFileTypes: true });
      for (const e of entries) {
        const name = typeof e.name === 'string' ? e.name : String(e.name);
        if ((name.startsWith(HIDDEN_PREFIX) && !VISIBLE_HIDDEN.has(name)) || IGNORED_NAMES.has(name)) continue;
        if (ig.ignores(name)) continue;
        const childAbs = join(absPath, name);
        if (e.isFile()) {
          fileCount++;
          try {
            const content = await readFile(childAbs, 'utf-8');
            totalLines += content.split('\n').length;
          } catch { /* skip binary/unreadable */ }
        } else if (e.isDirectory()) {
          const sub = await this.countStats(childAbs, ig);
          fileCount += sub.fileCount;
          totalLines += sub.totalLines;
        }
      }
    } catch { /* dir not accessible */ }
    return { fileCount, totalLines };
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

  async saveFileContent(relativePath: string, content: string): Promise<void> {
    const base = resolve(this.config.getPlaygroundsDir());
    const absPath = resolve(base, relativePath);
    const rel = relative(base, absPath);
    if (rel.startsWith('..') || absPath === base || pathInIgnoredDir(rel)) {
      throw new NotFoundException('File not found');
    }
    // Ensure parent directory exists
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, 'utf-8');
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

  private async getGitStatuses(dir: string): Promise<Map<string, PlaygroundEntry['gitStatus']>> {
    const statuses = new Map<string, PlaygroundEntry['gitStatus']>();
    try {
      // First, get the git top-level directory to resolve relative paths
      const { stdout: tlStdout } = await execAsync('git rev-parse --show-toplevel', { cwd: dir });
      const topLevel = realpathSync(tlStdout.trim());
      const realDir = realpathSync(dir);

      // Get porcelain status
      const { stdout } = await execAsync('git status --porcelain -unormal -z', { cwd: dir });
      // -z uses NUL byte termination
      const entries = stdout.split('\0');
      
      let i = 0;
      while (i < entries.length) {
        if (!entries[i]) {
          i++;
          continue;
        }
        const entry = entries[i];
        const statusStr = entry.slice(0, 2);
        const relPath = entry.slice(3);
        
        let fileStatus: PlaygroundEntry['gitStatus'] | undefined;
        if (statusStr.includes('M')) fileStatus = 'modified';
        else if (statusStr.includes('?')) fileStatus = 'untracked';
        else if (statusStr.includes('A')) fileStatus = 'added';
        else if (statusStr.includes('D')) fileStatus = 'deleted';
        else if (statusStr.includes('R')) fileStatus = 'renamed';
        
        if (fileStatus) {
          // Resolve absolute path using topLevel
          const absPath = join(topLevel, relPath);
          // Store it by relative path to the playground dir to avoid symlink issues (e.g. macOS tmpdir)
          const playgroundRelPath = relative(realDir, absPath);
          statuses.set(playgroundRelPath, fileStatus);
        }
        
        // If it was renamed, it takes up two entries in the -z output (new path, then old path)
        if (statusStr.includes('R')) {
          i += 2; // skip both
        } else {
          i += 1;
        }
      }
    } catch {
      // Git command failed, ignore and return empty map
    }
    return statuses;
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
      if ((name.startsWith(HIDDEN_PREFIX) && !VISIBLE_HIDDEN.has(name)) || IGNORED_NAMES.has(name)) continue;
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

  private async readDir(absPath: string, relativePath: string, parentIg: GitignoreFilter, statuses: Map<string, PlaygroundEntry['gitStatus']>): Promise<PlaygroundEntry[]> {
    if (IGNORED_NAMES.has(basename(absPath))) return [];
    try {
      const ig = await loadGitignore(absPath, parentIg);
      const entries = await readdir(absPath, { withFileTypes: true });
      const result: PlaygroundEntry[] = [];
      const dirs: { name: string; abs: string; rel: string }[] = [];
      const files: { name: string; rel: string }[] = [];
      for (const e of entries) {
        const name = typeof e.name === 'string' ? e.name : String(e.name);
        if ((name.startsWith(HIDDEN_PREFIX) && !VISIBLE_HIDDEN.has(name)) || IGNORED_NAMES.has(name)) continue;
        const rel = relativePath ? `${relativePath}/${name}` : name;
        if (ig.ignores(name)) continue;
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
          children: await this.readDir(d.abs, d.rel, ig, statuses),
        });
      }
      for (const f of files) {
        let mtime: number | undefined;
        const absFilePath = join(absPath, f.name);
        try {
          const st = await stat(absFilePath);
          mtime = st.mtimeMs;
        } catch { /* ignore */ }
        
        const gitStatus = statuses.get(f.rel);
        result.push({ name: f.name, path: f.rel, type: 'file', mtime, gitStatus });
      }
      return result;
    } catch {
      return [];
    }
  }
}
