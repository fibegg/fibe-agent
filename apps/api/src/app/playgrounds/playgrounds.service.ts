import { stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join, resolve, relative, basename } from 'node:path';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { PlaygroundBrowserService } from './playground-browser.service';
import { loadGitignore, type GitignoreFilter } from '../gitignore-utils';
import { loadFibeSettings, type ResolvedFibeSettings } from '../fibe-settings';
import {
  readTrustedFile,
  writeTrustedFile,
  inspectTrustedFile,
  inspectTrustedDirectory,
  listTrustedDirectory,
  type TrustedFileScope,
} from '../trusted-files';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  isLocalPlaygroundsUnavailableError,
  runLocalPlaygroundsCli,
} from './local-playgrounds-cli';

const execAsync = promisify(exec);

function execFileAsync(
  file: string,
  args: string[],
  options: { cwd?: string; maxBuffer?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      file,
      args,
      { ...options, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise({
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
        });
      },
    );
  });
}

function execFileAllowNonZero(
  file: string,
  args: string[],
  options: { cwd?: string; maxBuffer?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    execFile(
      file,
      args,
      { ...options, encoding: 'utf8' },
      (_error, stdout, stderr) => {
        resolvePromise({
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
        });
      },
    );
  });
}

export interface PlaygroundEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  mtime?: number;
  children?: PlaygroundEntry[];
  gitStatus?: 'modified' | 'untracked' | 'deleted' | 'added' | 'renamed';
}

export interface ChangedFile {
  /** Short path relative to the playground root. */
  path: string;
  /** X column of `git status --short`: index status. */
  index: string;
  /** Y column of `git status --short`: worktree status. */
  worktree: string;
}

export interface PlaygroundDiffResult {
  /** List of changed / untracked files. */
  files: ChangedFile[];
  /** Raw unified-diff output of `git diff HEAD`. */
  diff: string;
  /** True when there is any diff content or status entries. */
  hasDiff: boolean;
  /** True when the directory is inside a git repository. */
  isGitRepo: boolean;
  /** Absolute repository root when known. */
  repoRoot?: string;
  /** Active branch name, or detached HEAD hash. */
  branch?: string;
  upstream?: string | null;
  counts?: { staged: number; unstaged: number; untracked: number };
  repo?: LocalPlaygroundRepo;
  repos?: LocalPlaygroundRepo[];
}

export interface GitOperationResult {
  ok: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
  branch?: string;
}

const HIDDEN_PREFIX = '.';

/** Maximum recursion depth for directory traversal (prevents symlink cycle crashes). */
const MAX_DEPTH = 50;

interface LocalPlaygroundName {
  id?: string;
  name: string;
  spec?: string;
}

interface LocalPlaygroundUrl {
  service: string;
  url: string;
}

export interface LocalPlaygroundRepo {
  id?: string;
  service: string;
  repository?: string;
  branch?: string;
  link_path: string;
  target: string;
  repo_root: string;
}

function parseLocalPlaygroundNames(stdout: string): LocalPlaygroundName[] {
  return JSON.parse(stdout) as LocalPlaygroundName[];
}

function parseLocalPlaygroundUrls(stdout: string): string[] {
  const entries = JSON.parse(stdout) as LocalPlaygroundUrl[];
  const seen = new Set<string>();
  return entries
    .filter((entry) => entry.service && entry.url)
    .map((entry) => `${entry.service}|${entry.url}`)
    .filter((entry) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

function parseLocalPlaygroundRepos(stdout: string): LocalPlaygroundRepo[] {
  return JSON.parse(stdout) as LocalPlaygroundRepo[];
}

@Injectable()
export class PlaygroundsService {
  private readonly logger = new Logger(PlaygroundsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly playgroundBrowser: PlaygroundBrowserService,
  ) {}

  async getTree(): Promise<PlaygroundEntry[]> {
    const scope = await this.fileScope();
    const read = async (path: string) =>
      (await readTrustedFile(scope, relative(scope.root, path))).toString(
        'utf8',
      );
    const settings = await loadFibeSettings(scope.root, read);
    const ig = await loadGitignore(scope.root, undefined, read);
    const statuses = await this.getGitStatuses(this.config.getPlaygroundsDir());
    return this.readDir(
      this.config.getPlaygroundsDir(),
      '',
      ig,
      statuses,
      settings,
      scope,
    );
  }

  async getStats(): Promise<{
    fileCount: number;
    totalLines: number;
    hasGitRepo: boolean;
  }> {
    const dir = this.config.getPlaygroundsDir();
    const scope = await this.fileScope();
    const read = async (path: string) =>
      (await readTrustedFile(scope, relative(scope.root, path))).toString(
        'utf8',
      );
    const settings = await loadFibeSettings(dir, read);
    const ig = await loadGitignore(dir, undefined, read);
    const [counts, repos] = await Promise.all([
      this.countStats(dir, ig, settings, scope),
      this.getRepos().catch(() => []),
    ]);
    return { ...counts, hasGitRepo: repos.length > 0 };
  }

  async getRepos(): Promise<LocalPlaygroundRepo[]> {
    try {
      const stdout = await runLocalPlaygroundsCli(this.config, [
        'info',
        '--view',
        'repos',
        '--link-dir',
        this.config.getPlaygroundsDir(),
      ]);
      return parseLocalPlaygroundRepos(stdout).filter((repo) => repo.repo_root);
    } catch (err: unknown) {
      if (isLocalPlaygroundsUnavailableError(err)) return [];
      throw err;
    }
  }

  async getDiff(repo?: string): Promise<PlaygroundDiffResult> {
    const dir = this.config.getPlaygroundsDir();
    const empty: PlaygroundDiffResult = {
      files: [],
      diff: '',
      hasDiff: false,
      isGitRepo: false,
    };
    if (!dir) return empty;

    const resolved = await this.resolveRepo(repo);
    if (!resolved) {
      return empty;
    }
    const repoDir = resolved.repo.repo_root;

    const [statusResult, diffResult, branchResult, upstreamResult] =
      await Promise.all([
        execAsync('git status --short -unormal', { cwd: repoDir }).catch(
          () => ({ stdout: '' }),
        ),
        execAsync('git diff HEAD', {
          cwd: repoDir,
          maxBuffer: 5 * 1024 * 1024,
        }).catch(() => ({ stdout: '' })),
        execAsync('git branch --show-current', { cwd: repoDir }).catch(() => ({
          stdout: '',
        })),
        execAsync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', {
          cwd: repoDir,
        }).catch(() => ({ stdout: '' })),
      ]);

    const files: ChangedFile[] = [];
    for (const line of statusResult.stdout.split('\n')) {
      if (line.length < 3) continue;
      const path = line.slice(3).trim();
      if (path) files.push({ path, index: line[0], worktree: line[1] });
    }

    const untrackedDiff = await this.untrackedDiff(repoDir, files);
    const diff = [diffResult.stdout, untrackedDiff].filter(Boolean).join('\n');
    const counts = files.reduce(
      (acc, file) => {
        if (file.index && file.index !== ' ' && file.index !== '?')
          acc.staged += 1;
        if (file.worktree && file.worktree !== ' ') acc.unstaged += 1;
        if (file.index === '?' || file.worktree === '?') acc.untracked += 1;
        return acc;
      },
      { staged: 0, unstaged: 0, untracked: 0 },
    );
    return {
      files,
      diff,
      hasDiff: files.length > 0 || diff.length > 0,
      isGitRepo: true,
      repoRoot: repoDir,
      branch: branchResult.stdout.trim() || 'HEAD',
      upstream: upstreamResult.stdout.trim() || null,
      counts,
      repo: resolved.repo,
      repos: resolved.repos,
    };
  }

  async getGitFileDiff(
    file?: string,
    repo?: string,
  ): Promise<PlaygroundDiffResult> {
    if (!file) return this.getDiff(repo);
    const resolved = await this.resolveRepo(repo);
    if (!resolved)
      return { files: [], diff: '', hasDiff: false, isGitRepo: false };
    const repoDir = resolved.repo.repo_root;
    const safePath = this.requireSafeGitPath(file);
    const [statusResult, diffResult] = await Promise.all([
      execFileAsync('git', ['status', '--short', '-unormal', '--', safePath], {
        cwd: repoDir,
      }).catch(() => ({ stdout: '', stderr: '' })),
      execFileAsync('git', ['diff', 'HEAD', '--', safePath], {
        cwd: repoDir,
        maxBuffer: 5 * 1024 * 1024,
      }).catch(() => ({ stdout: '', stderr: '' })),
    ]);
    const files = this.parseGitStatus(statusResult.stdout);
    const untrackedDiff = await this.untrackedDiff(repoDir, files);
    const diff = [diffResult.stdout, untrackedDiff].filter(Boolean).join('\n');
    return {
      files,
      diff,
      hasDiff: files.length > 0 || diff.length > 0,
      isGitRepo: true,
      repoRoot: repoDir,
      repo: resolved.repo,
      repos: resolved.repos,
    };
  }

  async stageGitFiles(
    files: string[],
    confirm: boolean,
    repo?: string,
  ): Promise<GitOperationResult> {
    if (!confirm) throw new Error('stage requires confirm=true');
    if (!Array.isArray(files) || files.length === 0)
      throw new Error('stage requires at least one file');
    const repoDir = await this.requireRepoDir(repo);
    const safeFiles = files.map((file) => this.requireSafeGitPath(file));
    const result = await execFileAsync('git', ['add', '--', ...safeFiles], {
      cwd: repoDir,
    });
    return {
      ok: true,
      message: `Staged ${safeFiles.length} file(s)`,
      ...result,
    };
  }

  async commitGit(
    message: string,
    confirm: boolean,
    repo?: string,
  ): Promise<GitOperationResult> {
    if (!confirm) throw new Error('commit requires confirm=true');
    const trimmed = message?.trim();
    if (!trimmed) throw new Error('commit requires a non-empty message');
    const repoDir = await this.requireRepoDir(repo);
    const staged = this.parseGitStatus(
      (
        await execFileAsync('git', ['status', '--short', '-unormal'], {
          cwd: repoDir,
        })
      ).stdout,
    ).filter((file) => file.index && file.index !== ' ' && file.index !== '?');
    if (staged.length === 0) throw new Error('commit requires staged files');
    const result = await execFileAsync('git', ['commit', '-m', trimmed], {
      cwd: repoDir,
      maxBuffer: 1024 * 1024,
    });
    return {
      ok: true,
      message: `Committed ${staged.length} file(s)`,
      ...result,
    };
  }

  async branchGit(create?: string, repo?: string): Promise<GitOperationResult> {
    const repoDir = await this.requireRepoDir(repo);
    if (create?.trim()) {
      const branch = this.requireSafeBranchName(create);
      const result = await execFileAsync('git', ['switch', '-c', branch], {
        cwd: repoDir,
      });
      return {
        ok: true,
        message: `Created and switched to ${branch}`,
        branch,
        ...result,
      };
    }
    const result = await execFileAsync('git', ['branch', '--show-current'], {
      cwd: repoDir,
    });
    return {
      ok: true,
      message: result.stdout.trim() || 'HEAD',
      branch: result.stdout.trim() || 'HEAD',
      ...result,
    };
  }

  async pushGit(
    confirm: boolean,
    remote = 'origin',
    branch?: string,
    repo?: string,
  ): Promise<GitOperationResult> {
    if (!confirm) throw new Error('push requires confirm=true');
    const repoDir = await this.requireRepoDir(repo);
    const safeRemote = this.requireSafeRemoteName(remote || 'origin');
    const safeBranch = this.requireSafeBranchName(
      branch?.trim() ||
        (await this.branchGit(undefined, repo)).branch ||
        'HEAD',
    );
    const result = await execFileAsync(
      'git',
      ['push', '-u', safeRemote, safeBranch],
      { cwd: repoDir, maxBuffer: 2 * 1024 * 1024 },
    );
    return {
      ok: true,
      message: `Pushed ${safeRemote}/${safeBranch}`,
      branch: safeBranch,
      ...result,
    };
  }

  async createDraftPrWithGh(
    confirm: boolean,
    title?: string,
    body?: string,
    repo?: string,
  ): Promise<GitOperationResult> {
    if (!confirm) throw new Error('PR handoff requires confirm=true');
    const repoDir = await this.requireRepoDir(repo);
    const args = ['pr', 'create', '--draft', '--fill'];
    if (title?.trim()) args.push('--title', title.trim());
    if (body?.trim()) args.push('--body', body.trim());
    const result = await execFileAsync('gh', args, {
      cwd: repoDir,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { ok: true, message: 'Draft PR created', ...result };
  }

  async getUrls(playground?: string): Promise<string[]> {
    try {
      const selectedPlayground = playground?.trim();
      if (selectedPlayground) {
        const stdout = await runLocalPlaygroundsCli(this.config, [
          'info',
          '--view',
          'urls',
          '--playground',
          selectedPlayground,
        ]);
        return parseLocalPlaygroundUrls(stdout);
      }

      const currentLink = await this.playgroundBrowser.getCurrentLink();
      if (currentLink) {
        const stdout = await runLocalPlaygroundsCli(this.config, [
          'info',
          '--view',
          'urls',
          '--playground',
          currentLink,
        ]);
        return parseLocalPlaygroundUrls(stdout);
      }

      const listStdout = await runLocalPlaygroundsCli(this.config, [
        'info',
        '--view',
        'names',
      ]);
      const playgrounds = parseLocalPlaygroundNames(listStdout)
        .map((playground) => playground.id || playground.name)
        .filter(Boolean);

      if (playgrounds.length !== 1) return [];

      const stdout = await runLocalPlaygroundsCli(this.config, [
        'info',
        '--view',
        'urls',
        '--playground',
        playgrounds[0],
      ]);
      return parseLocalPlaygroundUrls(stdout);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (isLocalPlaygroundsUnavailableError(err)) {
        this.logger.debug(
          `getUrls: playgrounds CLI unavailable: ${message.split('\n')[0]}`,
        );
      } else {
        this.logger.warn(
          `getUrls: unexpected error: ${message.split('\n')[0]}`,
        );
      }
      return [];
    }
  }

  private parseGitStatus(stdout: string): ChangedFile[] {
    const files: ChangedFile[] = [];
    for (const line of stdout.split('\n')) {
      if (line.length < 3) continue;
      const path = line.slice(3).trim();
      if (path) files.push({ path, index: line[0], worktree: line[1] });
    }
    return files;
  }

  private async untrackedDiff(
    repoDir: string,
    files: ChangedFile[],
  ): Promise<string> {
    const chunks: string[] = [];
    for (const file of files) {
      if (file.index !== '?' && file.worktree !== '?') continue;
      const safePath = this.requireSafeGitPath(file.path);
      try {
        const info = await stat(join(repoDir, safePath));
        if (!info.isFile()) continue;
      } catch {
        continue;
      }
      const result = await execFileAllowNonZero(
        'git',
        ['diff', '--no-index', '--', '/dev/null', safePath],
        {
          cwd: repoDir,
          maxBuffer: 5 * 1024 * 1024,
        },
      );
      if (result.stdout.trim()) chunks.push(result.stdout);
    }
    return chunks.join('\n');
  }

  private async resolveRepo(selector?: string): Promise<{
    repo: LocalPlaygroundRepo;
    repos: LocalPlaygroundRepo[];
  } | null> {
    const repos = await this.getRepos();
    if (repos.length === 0) return null;
    const trimmed = selector?.trim();
    if (!trimmed) {
      if (repos.length === 1) return { repo: repos[0], repos };
      throw new Error(
        'Multiple repositories are linked; pass repo as service, repository, id, link path, or repo root',
      );
    }
    const matches = repos.filter((repo) => this.repoMatches(repo, trimmed));
    if (matches.length === 1) return { repo: matches[0], repos };
    if (matches.length > 1)
      throw new Error(`Repository selector "${trimmed}" is ambiguous`);
    throw new Error(
      `Repository selector "${trimmed}" did not match any linked repository`,
    );
  }

  private async requireRepoDir(selector?: string): Promise<string> {
    const resolved = await this.resolveRepo(selector);
    if (!resolved)
      throw new Error('No git repository found in current playground state');
    return resolved.repo.repo_root;
  }

  private repoMatches(repo: LocalPlaygroundRepo, selector: string): boolean {
    const normalized = selector.trim();
    const values = [
      repo.id,
      repo.service,
      repo.repository,
      repo.branch,
      repo.link_path,
      repo.target,
      repo.repo_root,
      basename(repo.link_path || ''),
      basename(repo.repo_root || ''),
    ]
      .filter(Boolean)
      .map((value) => String(value));
    return values.some((value) => value === normalized);
  }

  private requireSafeGitPath(file: string): string {
    const normalized = file.trim().replace(/\\/g, '/');
    if (
      !normalized ||
      normalized.startsWith('/') ||
      normalized.includes('\0') ||
      normalized.split('/').includes('..')
    ) {
      throw new Error(`Unsafe git path: ${file}`);
    }
    return normalized;
  }

  private requireSafeBranchName(branch: string): string {
    const trimmed = branch.trim();
    if (
      !/^[A-Za-z0-9._/-]+$/.test(trimmed) ||
      trimmed.startsWith('-') ||
      trimmed.includes('..')
    ) {
      throw new Error(`Unsafe branch name: ${branch}`);
    }
    return trimmed;
  }

  private requireSafeRemoteName(remote: string): string {
    const trimmed = remote.trim();
    if (!/^[A-Za-z0-9._-]+$/.test(trimmed) || trimmed.startsWith('-')) {
      throw new Error(`Unsafe remote name: ${remote}`);
    }
    return trimmed;
  }

  private async countStats(
    absPath: string,
    parentIg: GitignoreFilter,
    settings: ResolvedFibeSettings,
    scope: TrustedFileScope,
    depth = 0,
    ancestors: ReadonlySet<string> = new Set(),
  ): Promise<{ fileCount: number; totalLines: number }> {
    if (depth > MAX_DEPTH) return { fileCount: 0, totalLines: 0 };
    let fileCount = 0;
    let totalLines = 0;
    try {
      const ig = await loadGitignore(absPath, parentIg, async (path) =>
        (await readTrustedFile(scope, relative(scope.root, path))).toString(
          'utf8',
        ),
      );
      const { entries, identity } = await inspectTrustedDirectory(
        scope,
        relative(scope.root, absPath),
      );
      if (ancestors.has(identity)) return { fileCount: 0, totalLines: 0 };
      const nextAncestors = new Set(ancestors).add(identity);
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
        const isDir = e.type === 'directory';
        const isFile = e.type === 'file';

        if (isFile) {
          fileCount++;
          try {
            const content = (
              await readTrustedFile(scope, relative(scope.root, childAbs))
            ).toString('utf8');
            totalLines += content.split('\n').length;
          } catch {
            /* skip binary/unreadable */
          }
        } else if (isDir) {
          const sub = await this.countStats(
            childAbs,
            ig,
            settings,
            scope,
            depth + 1,
            nextAncestors,
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

  private async fileScope(): Promise<TrustedFileScope> {
    const root = this.config.getPlaygroundsDir();
    const baseScope = {
      root,
      trustedRoots: [],
      ignoredNames: ['.git', 'node_modules'],
    };
    const settings = await loadFibeSettings(root, async (path) =>
      (await readTrustedFile(baseScope, relative(root, path))).toString('utf8'),
    );
    // Only the current CLI-selected repositories grant external target authority.
    const repos = await this.getRepos().catch(() => []);
    return {
      root,
      trustedRoots: repos.map((repo) => repo.repo_root),
      ignoredNames: [...settings.ignoredNames],
    };
  }

  async getFileBuffer(relativePath: string): Promise<Buffer> {
    return readTrustedFile(await this.fileScope(), relativePath);
  }

  async getFileContent(relativePath: string): Promise<string> {
    return (await this.getFileBuffer(relativePath)).toString('utf8');
  }

  /** Metadata only. Raw responses use getFileBuffer rather than reopening a path. */
  async getFilePath(relativePath: string): Promise<string> {
    return inspectTrustedFile(await this.fileScope(), relativePath);
  }

  async saveFileContent(relativePath: string, content: string): Promise<void> {
    await writeTrustedFile(
      await this.fileScope(),
      relativePath,
      Buffer.from(content, 'utf8'),
    );
  }

  async uploadFile(
    relativeDir: string,
    filename: string,
    buffer: Buffer,
  ): Promise<string> {
    const safeName =
      basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload';
    const path = relativeDir ? `${relativeDir}/${safeName}` : safeName;
    await writeTrustedFile(await this.fileScope(), path, buffer);
    return path;
  }

  async getFolderFileContents(
    relativePath: string,
  ): Promise<{ path: string; content: string }[]> {
    const scope = await this.fileScope();
    const settings = await loadFibeSettings(scope.root, async (path) =>
      (await readTrustedFile(scope, relative(scope.root, path))).toString(
        'utf8',
      ),
    );
    const base = resolve(scope.root);
    const absPath = resolve(base, relativePath);
    const rel = relative(base, absPath);
    if (!rel || rel.startsWith('..'))
      throw new NotFoundException('Folder not found');
    await listTrustedDirectory(scope, rel);
    return this.collectFileContents(absPath, rel, settings, scope);
  }

  private async getGitStatuses(
    dir: string,
  ): Promise<Map<string, PlaygroundEntry['gitStatus']>> {
    const statuses = new Map<string, PlaygroundEntry['gitStatus']>();
    try {
      const { stdout: tlStdout } = await execAsync(
        'git rev-parse --show-toplevel',
        { cwd: dir },
      );
      const topLevel = realpathSync(tlStdout.trim());
      const realDir = realpathSync(dir);

      const { stdout } = await execAsync('git status --porcelain -unormal -z', {
        cwd: dir,
      });
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
      // Return any statuses collected before malformed Git output.
    }
    return statuses;
  }

  private async collectFileContents(
    absPath: string,
    relPath: string,
    settings: ResolvedFibeSettings,
    scope: TrustedFileScope,
    depth = 0,
    ancestors: ReadonlySet<string> = new Set(),
  ): Promise<{ path: string; content: string }[]> {
    if (depth > MAX_DEPTH) return [];
    if (settings.ignoredNames.has(basename(absPath))) return [];
    const result: { path: string; content: string }[] = [];
    let entries;
    let nextAncestors: ReadonlySet<string>;
    try {
      const snapshot = await inspectTrustedDirectory(scope, relPath);
      if (ancestors.has(snapshot.identity)) return [];
      nextAncestors = new Set(ancestors).add(snapshot.identity);
      entries = snapshot.entries;
    } catch {
      return [];
    }
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
      const childRel = relPath ? `${relPath}/${name}` : name;
      const childAbs = join(absPath, name);
      const isDir = e.type === 'directory';
      const isFile = e.type === 'file';

      if (isFile) {
        try {
          const content = (await readTrustedFile(scope, childRel)).toString(
            'utf8',
          );
          result.push({ path: childRel, content });
        } catch {
          /* skip unreadable files */
        }
      } else if (isDir) {
        const sub = await this.collectFileContents(
          childAbs,
          childRel,
          settings,
          scope,
          depth + 1,
          nextAncestors,
        );
        result.push(...sub);
      }
    }
    return result;
  }

  private async readDir(
    absPath: string,
    relativePath: string,
    parentIg: GitignoreFilter,
    statuses: Map<string, PlaygroundEntry['gitStatus']>,
    settings: ResolvedFibeSettings,
    scope: TrustedFileScope,
    depth = 0,
    ancestors: ReadonlySet<string> = new Set(),
  ): Promise<PlaygroundEntry[]> {
    if (depth > MAX_DEPTH || settings.ignoredNames.has(basename(absPath)))
      return [];
    try {
      const ig = await loadGitignore(absPath, parentIg, async (path) =>
        (await readTrustedFile(scope, relative(scope.root, path))).toString(
          'utf8',
        ),
      );
      const { entries, identity } = await inspectTrustedDirectory(
        scope,
        relative(scope.root, absPath),
      );
      if (ancestors.has(identity)) return [];
      const nextAncestors = new Set(ancestors).add(identity);
      const result: PlaygroundEntry[] = [];
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
        const isDir = e.type === 'directory';
        const isFile = e.type === 'file';

        if (isDir) {
          dirs.push({ name, abs: join(absPath, name), rel });
        } else if (isFile) {
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
            statuses,
            settings,
            scope,
            depth + 1,
            nextAncestors,
          ),
        });
      }
      for (const f of files) {
        const mtime = f.mtime;

        const gitStatus = statuses.get(f.rel);
        result.push({
          name: f.name,
          path: f.rel,
          type: 'file',
          mtime,
          gitStatus,
        });
      }
      return result;
    } catch {
      return [];
    }
  }
}
