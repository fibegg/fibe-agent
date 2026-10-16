import { join, relative, basename } from 'node:path';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { StrategyRegistryService } from '../strategies/strategy-registry.service';
import {
  ConversationManagerService,
  DEFAULT_CONVERSATION_ID,
} from '../conversation/conversation-manager.service';
import { loadGitignore, type GitignoreFilter } from '../gitignore-utils';
import { loadFibeSettings, type ResolvedFibeSettings } from '../fibe-settings';
import { PlaygroundsService } from '../playgrounds/playgrounds.service';
import {
  readTrustedFile,
  writeTrustedFile,
  inspectTrustedFile,
  listTrustedDirectory,
  type TrustedFileScope,
} from '../trusted-files';

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
    @Optional()
    private readonly conversationManager?: ConversationManagerService,
    @Optional() private readonly playgrounds?: PlaygroundsService,
  ) {}

  getAgentWorkingDir(conversationId = DEFAULT_CONVERSATION_ID): string | null {
    if (
      this.conversationManager &&
      !this.conversationManager.get(conversationId)
    ) {
      return null;
    }
    const strategy = this.conversationManager
      ? this.strategyRegistry.resolveStrategy(
          this.conversationManager.dataDirProvider(conversationId),
        )
      : this.strategyRegistry.resolveStrategy();
    try {
      strategy.prepareWorkingDir?.();
    } catch {
      /* Best-effort workspace preparation. */
    }
    return strategy.getWorkingDir?.() ?? null;
  }

  async getTree(
    conversationId = DEFAULT_CONVERSATION_ID,
  ): Promise<AgentFileEntry[]> {
    const dir = this.getAgentWorkingDir(conversationId);
    if (!dir) return [];
    const scope = await this.fileScope(conversationId, dir);
    const read = async (path: string) =>
      (await readTrustedFile(scope, relative(scope.root, path))).toString(
        'utf8',
      );
    const settings = await loadFibeSettings(dir, read);
    const ig = await loadGitignore(dir, undefined, read);
    return this.readDir(dir, '', ig, settings, scope);
  }

  async getStats(
    conversationId = DEFAULT_CONVERSATION_ID,
  ): Promise<AgentWorkspaceStats> {
    const dir = this.getAgentWorkingDir(conversationId);
    if (!dir) return { fileCount: 0, totalLines: 0, workspaceAvailable: false };
    const scope = await this.fileScope(conversationId, dir);
    const read = async (path: string) =>
      (await readTrustedFile(scope, relative(scope.root, path))).toString(
        'utf8',
      );
    const settings = await loadFibeSettings(dir, read);
    const ig = await loadGitignore(dir, undefined, read);
    const stats = await this.countStats(dir, ig, settings, scope);
    return { ...stats, workspaceAvailable: true };
  }

  private async countStats(
    absPath: string,
    parentIg: GitignoreFilter,
    settings: ResolvedFibeSettings,
    scope: TrustedFileScope,
    depth = 0,
  ): Promise<{ fileCount: number; totalLines: number }> {
    if (depth > 50) return { fileCount: 0, totalLines: 0 };
    let fileCount = 0;
    let totalLines = 0;
    try {
      const ig = await loadGitignore(absPath, parentIg, async (path) =>
        (await readTrustedFile(scope, relative(scope.root, path))).toString(
          'utf8',
        ),
      );
      const entries = await listTrustedDirectory(
        scope,
        relative(scope.root, absPath),
      );
      for (const e of entries) {
        const name = typeof e.name === 'string' ? e.name : String(e.name);
        if (
          (name.startsWith(HIDDEN_PREFIX) &&
            !settings.showHidden &&
            !settings.visibleHidden.has(name)) ||
          settings.ignoredNames.has(name)
        ) {
          continue;
        }
        if (ig.ignores(name)) continue;
        const childAbs = join(absPath, name);
        if (e.type === 'file') {
          fileCount++;
          try {
            const content = (
              await readTrustedFile(scope, relative(scope.root, childAbs))
            ).toString('utf8');
            totalLines += content.split('\n').length;
          } catch {
            /* skip binary/unreadable */
          }
        } else if (e.type === 'directory') {
          const sub = await this.countStats(
            childAbs,
            ig,
            settings,
            scope,
            depth + 1,
          );
          fileCount += sub.fileCount;
          totalLines += sub.totalLines;
        }
      }
    } catch {
      /* dir not accessible */
    }
    return { fileCount, totalLines };
  }

  private async fileScope(
    conversationId: string,
    preparedRoot?: string,
  ): Promise<TrustedFileScope> {
    const root = preparedRoot ?? this.getAgentWorkingDir(conversationId);
    if (!root) throw new NotFoundException('No agent working directory');
    const baseScope = {
      root,
      trustedRoots: [],
      ignoredNames: ['.git', 'node_modules'],
    };
    const settings = await loadFibeSettings(root, async (path) =>
      (await readTrustedFile(baseScope, relative(root, path))).toString('utf8'),
    );
    const repos = (await this.playgrounds?.getRepos().catch(() => [])) ?? [];
    return {
      root,
      trustedRoots: repos.map((repo) => repo.repo_root),
      ignoredNames: [...settings.ignoredNames],
    };
  }

  async getFileBuffer(
    relativePath: string,
    conversationId = DEFAULT_CONVERSATION_ID,
  ): Promise<Buffer> {
    return readTrustedFile(await this.fileScope(conversationId), relativePath);
  }

  async getFileContent(
    relativePath: string,
    conversationId = DEFAULT_CONVERSATION_ID,
  ): Promise<string> {
    return (await this.getFileBuffer(relativePath, conversationId)).toString(
      'utf8',
    );
  }

  async saveFileContent(
    relativePath: string,
    content: string,
    conversationId = DEFAULT_CONVERSATION_ID,
  ): Promise<void> {
    await writeTrustedFile(
      await this.fileScope(conversationId),
      relativePath,
      Buffer.from(content, 'utf8'),
    );
  }

  /** Metadata only. Raw responses use getFileBuffer rather than reopening a path. */
  async getFilePath(
    relativePath: string,
    conversationId = DEFAULT_CONVERSATION_ID,
  ): Promise<string> {
    return inspectTrustedFile(
      await this.fileScope(conversationId),
      relativePath,
    );
  }

  async uploadFile(
    relativeDir: string,
    filename: string,
    buffer: Buffer,
    conversationId = DEFAULT_CONVERSATION_ID,
  ): Promise<string> {
    const safeName =
      basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload';
    const path = relativeDir ? `${relativeDir}/${safeName}` : safeName;
    await writeTrustedFile(await this.fileScope(conversationId), path, buffer);
    return path;
  }

  private async readDir(
    absPath: string,
    relativePath: string,
    parentIg: GitignoreFilter,
    settings: ResolvedFibeSettings,
    scope: TrustedFileScope,
    depth = 0,
  ): Promise<AgentFileEntry[]> {
    if (depth > 50 || settings.ignoredNames.has(basename(absPath))) return [];
    try {
      const ig = await loadGitignore(absPath, parentIg, async (path) =>
        (await readTrustedFile(scope, relative(scope.root, path))).toString(
          'utf8',
        ),
      );
      const entries = await listTrustedDirectory(
        scope,
        relative(scope.root, absPath),
      );
      const result: AgentFileEntry[] = [];
      const dirs: { name: string; abs: string; rel: string }[] = [];
      const files: { name: string; rel: string; mtime: number }[] = [];
      for (const e of entries) {
        const name = typeof e.name === 'string' ? e.name : String(e.name);
        if (
          (name.startsWith(HIDDEN_PREFIX) &&
            !settings.showHidden &&
            !settings.visibleHidden.has(name)) ||
          settings.ignoredNames.has(name)
        ) {
          continue;
        }
        const rel = relativePath ? `${relativePath}/${name}` : name;
        if (ig.ignores(name)) continue;
        if (e.type === 'directory') {
          dirs.push({ name, abs: join(absPath, name), rel });
        } else if (e.type === 'file') {
          files.push({ name, rel, mtime: e.mtime });
        }
      }
      dirs.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));
      for (const d of dirs) {
        result.push({
          name: d.name,
          path: d.rel,
          type: 'directory',
          children: await this.readDir(
            d.abs,
            d.rel,
            ig,
            settings,
            scope,
            depth + 1,
          ),
        });
      }
      for (const f of files) {
        const mtime = f.mtime;
        result.push({ name: f.name, path: f.rel, type: 'file', mtime });
      }
      return result;
    } catch {
      return [];
    }
  }
}
