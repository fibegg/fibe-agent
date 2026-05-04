import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, relative, basename } from 'node:path';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { StrategyRegistryService } from '../strategies/strategy-registry.service';
import { ConversationManagerService, DEFAULT_CONVERSATION_ID } from '../conversation/conversation-manager.service';
import { loadGitignore, type GitignoreFilter } from '../gitignore-utils';
import { loadFibeSettings, type ResolvedFibeSettings } from '../fibe-settings';

export interface AgentFileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  mtime?: number;
  children?: AgentFileEntry[];
}

export interface AgentWorkspaceStats {
  fileCount: number;
  totalLines: number;
  workspaceAvailable: boolean;
}

const HIDDEN_PREFIX = '.';


@Injectable()
export class AgentFilesService {
  constructor(
    private readonly strategyRegistry: StrategyRegistryService,
    @Optional() private readonly conversationManager?: ConversationManagerService,
  ) {}

  getAgentWorkingDir(conversationId = DEFAULT_CONVERSATION_ID): string | null {
    if (this.conversationManager && !this.conversationManager.get(conversationId)) {
      return null;
    }
    const strategy = this.conversationManager
      ? this.strategyRegistry.resolveStrategy(this.conversationManager.dataDirProvider(conversationId))
      : this.strategyRegistry.resolveStrategy();
    try {
      strategy.prepareWorkingDir?.();
    } catch {
      /* Best-effort workspace preparation. */
    }
    return strategy.getWorkingDir?.() ?? null;
  }

  async getTree(conversationId = DEFAULT_CONVERSATION_ID): Promise<AgentFileEntry[]> {
    const dir = this.getAgentWorkingDir(conversationId);
    if (!dir) return [];
    const settings = await loadFibeSettings(dir);
    const ig = await loadGitignore(dir);
    return this.readDir(dir, '', ig, settings);
  }

  async getStats(conversationId = DEFAULT_CONVERSATION_ID): Promise<AgentWorkspaceStats> {
    const dir = this.getAgentWorkingDir(conversationId);
    if (!dir) return { fileCount: 0, totalLines: 0, workspaceAvailable: false };
    const settings = await loadFibeSettings(dir);
    const ig = await loadGitignore(dir);
    const stats = await this.countStats(dir, ig, settings);
    return { ...stats, workspaceAvailable: true };
  }

  private async countStats(absPath: string, parentIg: GitignoreFilter, settings: ResolvedFibeSettings): Promise<{ fileCount: number; totalLines: number }> {
    let fileCount = 0;
    let totalLines = 0;
    try {
      const ig = await loadGitignore(absPath, parentIg);
      const entries = await readdir(absPath, { withFileTypes: true });
      for (const e of entries) {
        const name = typeof e.name === 'string' ? e.name : String(e.name);
        if (
          (name.startsWith(HIDDEN_PREFIX) && !settings.showHidden && !settings.visibleHidden.has(name)) ||
          settings.ignoredNames.has(name)
        ) {
          continue;
        }
        if (ig.ignores(name)) continue;
        const childAbs = join(absPath, name);
        if (e.isFile()) {
          fileCount++;
          try {
            const content = await readFile(childAbs, 'utf-8');
            totalLines += content.split('\n').length;
          } catch { /* skip binary/unreadable */ }
        } else if (e.isDirectory()) {
          const sub = await this.countStats(childAbs, ig, settings);
          fileCount += sub.fileCount;
          totalLines += sub.totalLines;
        }
      }
    } catch { /* dir not accessible */ }
    return { fileCount, totalLines };
  }

  async getFileContent(relativePath: string, conversationId = DEFAULT_CONVERSATION_ID): Promise<string> {
    const dir = this.getAgentWorkingDir(conversationId);
    if (!dir) throw new NotFoundException('No agent working directory');
    const settings = await loadFibeSettings(dir);
    const base = resolve(dir);
    const absPath = resolve(base, relativePath);
    const rel = relative(base, absPath);
    const segments = rel.replace(/\\/g, '/').split('/');
    if (rel.startsWith('..') || absPath === base || segments.some((seg) => settings.ignoredNames.has(seg))) {
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

  async uploadFile(relativeDir: string, filename: string, buffer: Buffer, conversationId = DEFAULT_CONVERSATION_ID): Promise<string> {
    const dir = this.getAgentWorkingDir(conversationId);
    if (!dir) throw new NotFoundException('No agent working directory');
    const base = resolve(dir);
    const settings = await loadFibeSettings(base);
    // Sanitise filename — strip any path separators so callers can't traverse
    const safeName = basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload';
    const targetDir = relativeDir ? resolve(base, relativeDir) : base;
    const relDir = relative(base, targetDir);
    const segments = relDir.replace(/\\/g, '/').split('/');
    if (relDir.startsWith('..') || segments.some((seg) => settings.ignoredNames.has(seg))) {
      throw new NotFoundException('Invalid upload path');
    }
    await mkdir(targetDir, { recursive: true });
    const absPath = join(targetDir, safeName);
    await writeFile(absPath, buffer);
    return relativeDir ? `${relDir}/${safeName}` : safeName;
  }

  private async readDir(absPath: string, relativePath: string, parentIg: GitignoreFilter, settings: ResolvedFibeSettings): Promise<AgentFileEntry[]> {
    if (settings.ignoredNames.has(basename(absPath))) return [];
    try {
      const ig = await loadGitignore(absPath, parentIg);
      const entries = await readdir(absPath, { withFileTypes: true });
      const result: AgentFileEntry[] = [];
      const dirs: { name: string; abs: string; rel: string }[] = [];
      const files: { name: string; rel: string }[] = [];
      for (const e of entries) {
        const name = typeof e.name === 'string' ? e.name : String(e.name);
        if (
          (name.startsWith(HIDDEN_PREFIX) && !settings.showHidden && !settings.visibleHidden.has(name)) ||
          settings.ignoredNames.has(name)
        ) {
          continue;
        }
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
          children: await this.readDir(d.abs, d.rel, ig, settings),
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
