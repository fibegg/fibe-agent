import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, relative, basename } from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import { StrategyRegistryService } from '../strategies/strategy-registry.service';
import { loadGitignore, type GitignoreFilter } from '../gitignore-utils';

export interface AgentFileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  mtime?: number;
  children?: AgentFileEntry[];
}

const HIDDEN_PREFIX = '.';
const IGNORED_NAMES = new Set<string>(['node_modules', '.git']);

function pathInIgnoredDir(relPath: string): boolean {
  const segments = relPath.replace(/\\/g, '/').split('/');
  return segments.some((seg) => IGNORED_NAMES.has(seg));
}

@Injectable()
export class AgentFilesService {
  constructor(private readonly strategyRegistry: StrategyRegistryService) {}

  getAgentWorkingDir(): string | null {
    const strategy = this.strategyRegistry.resolveStrategy();
    return strategy.getWorkingDir?.() ?? null;
  }

  async getTree(): Promise<AgentFileEntry[]> {
    const dir = this.getAgentWorkingDir();
    if (!dir) return [];
    const ig = await loadGitignore(dir);
    return this.readDir(dir, '', ig);
  }

  async getStats(): Promise<{ fileCount: number; totalLines: number }> {
    const dir = this.getAgentWorkingDir();
    if (!dir) return { fileCount: 0, totalLines: 0 };
    const ig = await loadGitignore(dir);
    return this.countStats(dir, ig);
  }

  private async countStats(absPath: string, parentIg: GitignoreFilter): Promise<{ fileCount: number; totalLines: number }> {
    let fileCount = 0;
    let totalLines = 0;
    try {
      const ig = await loadGitignore(absPath, parentIg);
      const entries = await readdir(absPath, { withFileTypes: true });
      for (const e of entries) {
        const name = typeof e.name === 'string' ? e.name : String(e.name);
        if (name.startsWith(HIDDEN_PREFIX) || IGNORED_NAMES.has(name)) continue;
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
    const dir = this.getAgentWorkingDir();
    if (!dir) throw new NotFoundException('No agent working directory');
    const base = resolve(dir);
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

  private async readDir(absPath: string, relativePath: string, parentIg: GitignoreFilter): Promise<AgentFileEntry[]> {
    if (IGNORED_NAMES.has(basename(absPath))) return [];
    try {
      const ig = await loadGitignore(absPath, parentIg);
      const entries = await readdir(absPath, { withFileTypes: true });
      const result: AgentFileEntry[] = [];
      const dirs: { name: string; abs: string; rel: string }[] = [];
      const files: { name: string; rel: string }[] = [];
      for (const e of entries) {
        const name = typeof e.name === 'string' ? e.name : String(e.name);
        if (name.startsWith(HIDDEN_PREFIX) || IGNORED_NAMES.has(name)) continue;
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
          children: await this.readDir(d.abs, d.rel, ig),
        });
      }
      for (const f of files) {
        let mtime: number | undefined;
        try {
          const st = await stat(join(absPath, f.name));
          mtime = st.mtimeMs;
        } catch { /* ignore */ }
        result.push({ name: f.name, path: f.rel, type: 'file', mtime });
      }
      return result;
    } catch {
      return [];
    }
  }
}
