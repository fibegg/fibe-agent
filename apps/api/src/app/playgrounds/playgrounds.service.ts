import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { join, resolve, relative, basename } from 'node:path';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { PlayroomBrowserService } from './playroom-browser.service';
import { loadGitignore, type GitignoreFilter } from '../gitignore-utils';
import { loadFibeSettings, type ResolvedFibeSettings } from '../fibe-settings';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isLocalPlaygroundsUnavailableError, runLocalPlaygroundsCli } from './local-playgrounds-cli';

const execAsync = promisify(exec);

function execFileAsync(
  file: string,
  args: string[],
  options: { cwd?: string; maxBuffer?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    execFile(file, args, { ...options, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
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
  playspec?: string;
}

interface LocalPlaygroundUrl {
  service: string;
  url: string;
}

function parseLocalPlaygroundNames(stdout: string): LocalPlaygroundName[] {
  return JSON.parse(stdout) as LocalPlaygroundName[];
}

function parseLocalPlaygroundUrls(stdout: string): string[] {
  const entries = JSON.parse(stdout) as LocalPlaygroundUrl[];
  return entries
    .filter((entry) => entry.service && entry.url)
    .map((entry) => `${entry.service}|${entry.url}`);
}

@Injectable()
export class PlaygroundsService {
  private readonly logger = new Logger(PlaygroundsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly playroomBrowser: PlayroomBrowserService,
  ) {}

  async getTree(): Promise<PlaygroundEntry[]> {
    const settings = await loadFibeSettings(this.config.getPlaygroundsDir());
    const ig = await loadGitignore(this.config.getPlaygroundsDir());
    const statuses = await this.getGitStatuses(this.config.getPlaygroundsDir());
    return this.readDir(this.config.getPlaygroundsDir(), '', ig, statuses, settings);
  }

  async getStats(): Promise<{ fileCount: number; totalLines: number; hasGitRepo: boolean }> {
    const dir = this.config.getPlaygroundsDir();
    const settings = await loadFibeSettings(dir);
    const ig = await loadGitignore(dir);
    const [counts, gitRepoDir] = await Promise.all([
      this.countStats(dir, ig, settings),
      this.findFirstGitRepoDir(dir, ig, settings),
    ]);
    return { ...counts, hasGitRepo: gitRepoDir !== null };
  }

  async getDiff(): Promise<PlaygroundDiffResult> {
    const dir = this.config.getPlaygroundsDir();
    const empty: PlaygroundDiffResult = { files: [], diff: '', hasDiff: false, isGitRepo: false };
    if (!dir) return empty;

    const settings = await loadFibeSettings(dir);
    const ig = await loadGitignore(dir);
    const repoDir = await this.findFirstGitRepoDir(dir, ig, settings);
    if (!repoDir) {
      return empty;
    }

    const [statusResult, diffResult, branchResult, upstreamResult] = await Promise.all([
      execAsync('git status --short -unormal', { cwd: repoDir }).catch(() => ({ stdout: '' })),
      execAsync('git diff HEAD', { cwd: repoDir, maxBuffer: 5 * 1024 * 1024 }).catch(() => ({ stdout: '' })),
      execAsync('git branch --show-current', { cwd: repoDir }).catch(() => ({ stdout: '' })),
      execAsync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', { cwd: repoDir }).catch(() => ({ stdout: '' })),
    ]);

    // Parse changed files from `git status --short`
    const files: ChangedFile[] = [];
    for (const line of statusResult.stdout.split('\n')) {
      if (line.length < 3) continue;
      const path = line.slice(3).trim();
      if (path) files.push({ path, index: line[0], worktree: line[1] });
    }

    const diff = diffResult.stdout;
    const counts = files.reduce(
      (acc, file) => {
        if (file.index && file.index !== ' ' && file.index !== '?') acc.staged += 1;
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
    };
  }

  async getGitFileDiff(file?: string): Promise<PlaygroundDiffResult> {
    if (!file) return this.getDiff();
    const repoDir = await this.getRepoDir();
    if (!repoDir) return { files: [], diff: '', hasDiff: false, isGitRepo: false };
    const safePath = this.requireSafeGitPath(file);
    const [statusResult, diffResult] = await Promise.all([
      execFileAsync('git', ['status', '--short', '-unormal', '--', safePath], { cwd: repoDir }).catch(() => ({ stdout: '', stderr: '' })),
      execFileAsync('git', ['diff', 'HEAD', '--', safePath], { cwd: repoDir, maxBuffer: 5 * 1024 * 1024 }).catch(() => ({ stdout: '', stderr: '' })),
    ]);
    const files = this.parseGitStatus(statusResult.stdout);
    return {
      files,
      diff: diffResult.stdout,
      hasDiff: files.length > 0 || diffResult.stdout.length > 0,
      isGitRepo: true,
      repoRoot: repoDir,
    };
  }

  async stageGitFiles(files: string[], confirm: boolean): Promise<GitOperationResult> {
    if (!confirm) throw new Error('stage requires confirm=true');
    if (!Array.isArray(files) || files.length === 0) throw new Error('stage requires at least one file');
    const repoDir = await this.requireRepoDir();
    const safeFiles = files.map((file) => this.requireSafeGitPath(file));
    const result = await execFileAsync('git', ['add', '--', ...safeFiles], { cwd: repoDir });
    return { ok: true, message: `Staged ${safeFiles.length} file(s)`, ...result };
  }

  async commitGit(message: string, confirm: boolean): Promise<GitOperationResult> {
    if (!confirm) throw new Error('commit requires confirm=true');
    const trimmed = message?.trim();
    if (!trimmed) throw new Error('commit requires a non-empty message');
    const repoDir = await this.requireRepoDir();
    const staged = this.parseGitStatus((await execFileAsync('git', ['status', '--short', '-unormal'], { cwd: repoDir })).stdout)
      .filter((file) => file.index && file.index !== ' ' && file.index !== '?');
    if (staged.length === 0) throw new Error('commit requires staged files');
    const result = await execFileAsync('git', ['commit', '-m', trimmed], { cwd: repoDir, maxBuffer: 1024 * 1024 });
    return { ok: true, message: `Committed ${staged.length} file(s)`, ...result };
  }

  async branchGit(create?: string): Promise<GitOperationResult> {
    const repoDir = await this.requireRepoDir();
    if (create?.trim()) {
      const branch = this.requireSafeBranchName(create);
      const result = await execFileAsync('git', ['switch', '-c', branch], { cwd: repoDir });
      return { ok: true, message: `Created and switched to ${branch}`, branch, ...result };
    }
    const result = await execFileAsync('git', ['branch', '--show-current'], { cwd: repoDir });
    return { ok: true, message: result.stdout.trim() || 'HEAD', branch: result.stdout.trim() || 'HEAD', ...result };
  }

  async pushGit(confirm: boolean, remote = 'origin', branch?: string): Promise<GitOperationResult> {
    if (!confirm) throw new Error('push requires confirm=true');
    const repoDir = await this.requireRepoDir();
    const safeRemote = this.requireSafeRemoteName(remote || 'origin');
    const safeBranch = this.requireSafeBranchName(branch?.trim() || (await this.branchGit()).branch || 'HEAD');
    const result = await execFileAsync('git', ['push', '-u', safeRemote, safeBranch], { cwd: repoDir, maxBuffer: 2 * 1024 * 1024 });
    return { ok: true, message: `Pushed ${safeRemote}/${safeBranch}`, branch: safeBranch, ...result };
  }

  async createDraftPrWithGh(confirm: boolean, title?: string, body?: string): Promise<GitOperationResult> {
    if (!confirm) throw new Error('PR handoff requires confirm=true');
    const repoDir = await this.requireRepoDir();
    const args = ['pr', 'create', '--draft', '--fill'];
    if (title?.trim()) args.push('--title', title.trim());
    if (body?.trim()) args.push('--body', body.trim());
    const result = await execFileAsync('gh', args, { cwd: repoDir, maxBuffer: 2 * 1024 * 1024 });
    return { ok: true, message: 'Draft PR created', ...result };
  }

  async getUrls(): Promise<string[]> {
    try {
      const currentLink = await this.playroomBrowser.getCurrentLink();
      if (currentLink) {
        const stdout = await runLocalPlaygroundsCli(this.config, ['info', '--view', 'urls', '--playground', currentLink]);
        return parseLocalPlaygroundUrls(stdout);
      }

      const listStdout = await runLocalPlaygroundsCli(this.config, ['info', '--view', 'names']);
      const playgrounds = parseLocalPlaygroundNames(listStdout)
        .map((playground) => playground.id || playground.name)
        .filter(Boolean);
      const urls: string[] = [];

      for (const playground of playgrounds) {
        const stdout = await runLocalPlaygroundsCli(this.config, ['info', '--view', 'urls', '--playground', playground]);
        urls.push(...parseLocalPlaygroundUrls(stdout));
      }

      return urls;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (isLocalPlaygroundsUnavailableError(err)) {
        this.logger.debug(`getUrls: playgrounds CLI unavailable — ${message.split('\n')[0]}`);
      } else {
        this.logger.warn(`getUrls: unexpected error — ${message.split('\n')[0]}`);
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

  private async getRepoDir(): Promise<string | null> {
    const dir = this.config.getPlaygroundsDir();
    if (!dir) return null;
    const settings = await loadFibeSettings(dir);
    const ig = await loadGitignore(dir);
    return this.findFirstGitRepoDir(dir, ig, settings);
  }

  private async requireRepoDir(): Promise<string> {
    const repoDir = await this.getRepoDir();
    if (!repoDir) throw new Error('No git repository found in playgrounds directory');
    return repoDir;
  }

  private requireSafeGitPath(file: string): string {
    const normalized = file.trim().replace(/\\/g, '/');
    if (!normalized || normalized.startsWith('/') || normalized.includes('\0') || normalized.split('/').includes('..')) {
      throw new Error(`Unsafe git path: ${file}`);
    }
    return normalized;
  }

  private requireSafeBranchName(branch: string): string {
    const trimmed = branch.trim();
    if (!/^[A-Za-z0-9._/-]+$/.test(trimmed) || trimmed.startsWith('-') || trimmed.includes('..')) {
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

  private async countStats(absPath: string, parentIg: GitignoreFilter, settings: ResolvedFibeSettings, depth = 0): Promise<{ fileCount: number; totalLines: number }> {
    if (depth > MAX_DEPTH) return { fileCount: 0, totalLines: 0 };
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
        let isDir = e.isDirectory();
        let isFile = e.isFile();

        if (e.isSymbolicLink()) {
          try {
            const st = await stat(childAbs);
            isDir = st.isDirectory();
            isFile = st.isFile();
          } catch {
            continue;
          }
        }

        if (isFile) {
          fileCount++;
          try {
            const content = await readFile(childAbs, 'utf-8');
            totalLines += content.split('\n').length;
          } catch { /* skip binary/unreadable */ }
        } else if (isDir) {
          const sub = await this.countStats(childAbs, ig, settings, depth + 1);
          fileCount += sub.fileCount;
          totalLines += sub.totalLines;
        }
      }
    } catch { /* dir not accessible */ }
    return { fileCount, totalLines };
  }

  private async findFirstGitRepoDir(
    absPath: string,
    parentIg: GitignoreFilter,
    settings: ResolvedFibeSettings,
    depth = 0,
  ): Promise<string | null> {
    if (depth > MAX_DEPTH) return null;

    try {
      await stat(join(absPath, '.git'));
      return absPath;
    } catch {
      // Continue scanning child directories.
    }

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
        let isDir = e.isDirectory();

        if (e.isSymbolicLink()) {
          try {
            const st = await stat(childAbs);
            isDir = st.isDirectory();
          } catch {
            continue;
          }
        }

        if (!isDir) continue;

        const repoDir = await this.findFirstGitRepoDir(childAbs, ig, settings, depth + 1);
        if (repoDir) return repoDir;
      }
    } catch {
      return null;
    }

    return null;
  }

  async getFileContent(relativePath: string): Promise<string> {
    return readFile(await this.getFilePath(relativePath), 'utf-8');
  }

  async getFilePath(relativePath: string): Promise<string> {
    const settings = await loadFibeSettings(this.config.getPlaygroundsDir());
    const base = resolve(this.config.getPlaygroundsDir());
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
    return absPath;
  }

  async saveFileContent(relativePath: string, content: string): Promise<void> {
    const settings = await loadFibeSettings(this.config.getPlaygroundsDir());
    const base = resolve(this.config.getPlaygroundsDir());
    const absPath = resolve(base, relativePath);
    const rel = relative(base, absPath);
    const segments = rel.replace(/\\/g, '/').split('/');
    if (rel.startsWith('..') || absPath === base || segments.some((seg) => settings.ignoredNames.has(seg))) {
      throw new NotFoundException('File not found');
    }
    // Ensure parent directory exists
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, 'utf-8');
  }

  async uploadFile(relativeDir: string, filename: string, buffer: Buffer): Promise<string> {
    const base = resolve(this.config.getPlaygroundsDir());
    const settings = await loadFibeSettings(base);
    // Sanitise filename — strip any path separators so callers can't traverse
    const safeName = basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload';
    const targetDir = relativeDir ? resolve(base, relativeDir) : base;
    const relDir = relative(base, targetDir);
    const segments = relDir.replace(/\\/g, '/').split('/');
    if (relDir.startsWith('..') || segments.some((seg) => settings.ignoredNames.has(seg))) {
      throw new NotFoundException('Invalid upload path');
    }

    try {
      const baseStat = await stat(base).catch((err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') return null;
        throw err;
      });
      if (baseStat && !baseStat.isDirectory()) {
        throw new NotFoundException('Playgrounds directory is unavailable');
      }
      await mkdir(targetDir, { recursive: true });
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new NotFoundException('Playgrounds directory is unavailable');
    }

    const absPath = join(targetDir, safeName);
    try {
      await writeFile(absPath, buffer);
    } catch {
      throw new NotFoundException('Playgrounds directory is unavailable');
    }
    return relativeDir ? `${relDir}/${safeName}` : safeName;
  }

  async getFolderFileContents(
    relativePath: string
  ): Promise<{ path: string; content: string }[]> {
    const settings = await loadFibeSettings(this.config.getPlaygroundsDir());
    const base = resolve(this.config.getPlaygroundsDir());
    const absPath = resolve(base, relativePath);
    const rel = relative(base, absPath);
    const segments = rel.replace(/\\/g, '/').split('/');
    if (rel.startsWith('..') || absPath === base || segments.some((seg) => settings.ignoredNames.has(seg))) {
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
    return this.collectFileContents(absPath, rel, settings);
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
    relPath: string,
    settings: ResolvedFibeSettings
  ): Promise<{ path: string; content: string }[]> {
    if (settings.ignoredNames.has(basename(absPath))) return [];
    const result: { path: string; content: string }[] = [];
    let entries;
    try {
      entries = await readdir(absPath, { withFileTypes: true });
    } catch {
      return [];
    }
    for (const e of entries) {
      const name = typeof e.name === 'string' ? e.name : String(e.name);
      if (
        (name.startsWith(HIDDEN_PREFIX) && !settings.showHidden && !settings.visibleHidden.has(name)) ||
        settings.ignoredNames.has(name)
      ) {
        continue;
      }
      const childRel = relPath ? `${relPath}/${name}` : name;
      const childAbs = join(absPath, name);
      let isDir = e.isDirectory();
      let isFile = e.isFile();

      if (e.isSymbolicLink?.()) {
        try {
          const st = await stat(childAbs);
          isDir = st.isDirectory();
          isFile = st.isFile();
        } catch {
          continue;
        }
      }

      if (isFile) {
        try {
          const content = await readFile(childAbs, 'utf-8');
          result.push({ path: childRel, content });
        } catch {
          /* skip unreadable files */
        }
      } else if (isDir) {
        const sub = await this.collectFileContents(childAbs, childRel, settings);
        result.push(...sub);
      }
    }
    return result;
  }

  private async readDir(absPath: string, relativePath: string, parentIg: GitignoreFilter, statuses: Map<string, PlaygroundEntry['gitStatus']>, settings: ResolvedFibeSettings, depth = 0): Promise<PlaygroundEntry[]> {
    if (depth > MAX_DEPTH || settings.ignoredNames.has(basename(absPath))) return [];
    try {
      const ig = await loadGitignore(absPath, parentIg);
      const entries = await readdir(absPath, { withFileTypes: true });
      const result: PlaygroundEntry[] = [];
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
        let isDir = e.isDirectory();
        let isFile = e.isFile();

        if (e.isSymbolicLink()) {
          try {
            const st = await stat(join(absPath, name));
            isDir = st.isDirectory();
            isFile = st.isFile();
          } catch {
            continue;
          }
        }

        if (isDir) {
          dirs.push({ name, abs: join(absPath, name), rel });
        } else if (isFile) {
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
          children: await this.readDir(d.abs, d.rel, ig, statuses, settings, depth + 1),
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
