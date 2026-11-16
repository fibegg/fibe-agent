import { Logger } from '@nestjs/common';
import { watch, type FSWatcher } from 'chokidar';
import { readFileSync, realpathSync, statSync, type Stats } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { parseGitignore, type GitignoreFilter } from './gitignore-utils';
import { isGeneratedWorkspaceName } from './generated-workspace-paths';

export { isGeneratedWorkspacePath } from './generated-workspace-paths';

export const WORKSPACE_REFRESH_MS = 2000;
/** Paths (directories and files) one watcher watches; each path is an OS watch handle. */
export const DEFAULT_WORKSPACE_WATCH_MAX_PATHS = 20_000;
export const WORKSPACE_WATCH_MAX_PATHS_ENV = 'FIBE_WATCH_MAX_PATHS';

const BUDGET_RECLAIM_INTERVAL_MS = 30_000;
const BUDGET_IN_FLIGHT_MS = 10_000;
const MAX_CACHED_DIRECTORIES = 50_000;

const logger = new Logger('WorkspaceWatcher');

export function workspaceWatchMaxPaths(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env[WORKSPACE_WATCH_MAX_PATHS_ENV]?.trim();
  const parsed = raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(parsed)
    ? parsed
    : DEFAULT_WORKSPACE_WATCH_MAX_PATHS;
}

function isWithin(path: string, dir: string): boolean {
  return (
    path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep)
  );
}

function realDirectory(path: string): string | null {
  try {
    return statSync(path).isDirectory() ? realpathSync(path) : null;
  } catch {
    return null;
  }
}

interface DirectoryState {
  pruned: boolean;
  /** .gitignore filters of this directory and its ancestors, matched against child names. */
  filters: readonly GitignoreFilter[];
}

const PRUNED: DirectoryState = { pruned: true, filters: [] };

/**
 * Synchronous mirror of what the file tree hides (agent-files and playgrounds
 * readDir): generated names, `.fibe/settings.json` fileBrowser.exclude names,
 * and each entry name matched against the .gitignore of its directory and of
 * every ancestor up to the root, as the tree's loadGitignore chain does.
 * chokidar calls `ignored` synchronously, so .gitignore files are read
 * synchronously and cached per directory until an event invalidates them.
 * Dot entries the tree hides stay watched: .gitignore and .fibe changes must
 * be seen, and settings can make the tree show them.
 */
export class WorkspacePruner {
  private readonly gitignores = new Map<string, GitignoreFilter | null>();
  private states = new Map<string, DirectoryState>();
  private excluded: ReadonlySet<string> | null = null;

  constructor(
    readonly root: string,
    private readonly read: (path: string) => string = (path) =>
      readFileSync(path, 'utf8'),
  ) {}

  prunes(path: string): boolean {
    if (path === this.root || !isWithin(path, this.root)) return false;
    const parent = this.state(dirname(path));
    return parent.pruned || this.hides(basename(path), parent.filters);
  }

  /** The .gitignore in `dir` (or `dir` itself) was added, changed or removed. */
  invalidate(dir: string): void {
    this.gitignores.delete(dir);
    this.states = new Map();
  }

  invalidateSettings(): void {
    this.excluded = null;
    this.states = new Map();
  }

  private state(dir: string): DirectoryState {
    let state = this.states.get(dir);
    if (state) return state;
    if (dir === this.root || !isWithin(dir, this.root)) {
      state = { pruned: false, filters: this.withGitignore([], dir) };
    } else {
      const parent = this.state(dirname(dir));
      state =
        parent.pruned || this.hides(basename(dir), parent.filters)
          ? PRUNED
          : { pruned: false, filters: this.withGitignore(parent.filters, dir) };
    }
    if (this.states.size >= MAX_CACHED_DIRECTORIES) this.states.clear();
    this.states.set(dir, state);
    return state;
  }

  private hides(name: string, filters: readonly GitignoreFilter[]): boolean {
    return (
      isGeneratedWorkspaceName(name) ||
      this.excludedNames().has(name) ||
      filters.some((filter) => filter.ignores(name))
    );
  }

  private withGitignore(
    filters: readonly GitignoreFilter[],
    dir: string,
  ): readonly GitignoreFilter[] {
    let own = this.gitignores.get(dir);
    if (own === undefined) {
      try {
        own = parseGitignore(this.read(join(dir, '.gitignore')));
      } catch {
        own = null;
      }
      if (this.gitignores.size >= MAX_CACHED_DIRECTORIES)
        this.gitignores.clear();
      this.gitignores.set(dir, own);
    }
    return own ? [...filters, own] : filters;
  }

  private excludedNames(): ReadonlySet<string> {
    if (!this.excluded) {
      let names: string[] = [];
      try {
        const settings = JSON.parse(
          this.read(join(this.root, '.fibe', 'settings.json')),
        ) as { fileBrowser?: { exclude?: unknown } } | null;
        const exclude = settings?.fileBrowser?.exclude;
        if (Array.isArray(exclude))
          names = exclude.filter((name) => typeof name === 'string');
      } catch {
        /* No settings: the tree's default exclusions are generated names. */
      }
      this.excluded = new Set(names);
    }
    return this.excluded;
  }
}

/**
 * Caps the paths one watcher admits. chokidar asks `ignored` before it opens
 * a watch, so admitted paths are counted there. Paths chokidar later drops
 * (deleted, or gone before their watch opened) are forgotten when the cap is
 * reached, at most every 30 s, by comparing with what chokidar still watches.
 */
class WatchBudget {
  private readonly admitted = new Map<string, number>();
  private reclaimedAt = 0;
  private exhausted = false;

  constructor(
    private readonly limit: number,
    private readonly watched: () => Iterable<string>,
    private readonly onExhausted: () => void,
  ) {}

  admit(path: string): boolean {
    if (this.admitted.has(path)) return true;
    if (this.admitted.size >= this.limit && !this.reclaim()) {
      if (!this.exhausted) {
        this.exhausted = true;
        this.onExhausted();
      }
      return false;
    }
    this.admitted.set(path, Date.now());
    return true;
  }

  private reclaim(): boolean {
    const now = Date.now();
    if (now - this.reclaimedAt < BUDGET_RECLAIM_INTERVAL_MS) return false;
    this.reclaimedAt = now;
    const watched = new Set(this.watched());
    for (const [path, admittedAt] of this.admitted) {
      // Recent admissions may still be opening their watch.
      if (now - admittedAt > BUDGET_IN_FLIGHT_MS && !watched.has(path))
        this.admitted.delete(path);
    }
    return this.admitted.size < this.limit;
  }
}

function* watchedPaths(watcher: FSWatcher | undefined): Iterable<string> {
  if (!watcher) return;
  for (const [dir, items] of Object.entries(watcher.getWatched()))
    for (const item of items) yield join(dir, item);
}

/** A real directory one watcher watches (its root, or a linked directory it followed). */
interface Claim {
  readonly real: string;
  /** The owner's path for `real`. */
  readonly path: string;
  readonly owner: WorkspaceWatcher;
  readonly followers: Set<Follower>;
}

/** A watcher that reaches a claimed directory and leaves it to the owner's watches. */
interface Follower {
  readonly watcher: WorkspaceWatcher;
  readonly claim: Claim;
  /** The follower's path for the directory, not watched by the follower. */
  readonly path: string;
  readonly real: string;
  /** The owner's path for the same directory; owner events under it are forwarded. */
  readonly ownerPath: string;
}

/**
 * Real directories with open watches, shared by every WorkspaceWatcher in the
 * process. Repositories are linked into both the playgrounds directory and
 * the Agent working directory; without this both watchers would open a
 * watch for every path of the same repository.
 */
const claims = new Map<string, Claim>();

function coveringClaim(real: string): Claim | undefined {
  for (let dir = real; ; dir = dirname(dir)) {
    const claim = claims.get(dir);
    if (claim) return claim;
    if (dirname(dir) === dir) return undefined;
  }
}

export interface WorkspaceWatcherOptions {
  /** Defaults to FIBE_WATCH_MAX_PATHS, else DEFAULT_WORKSPACE_WATCH_MAX_PATHS. */
  maxPaths?: number;
  warn?: (message: string) => void;
}

/**
 * Coalesced change notifications for a workspace file tree.
 *
 * Watches are opened only for what the file tree shows: generated names,
 * settings exclusions and .gitignore'd paths are pruned in `ignored`, before
 * chokidar descends. A .gitignore or settings change applies to paths seen
 * afterwards; watches already open under a newly ignored path stay until
 * restart, and a path that stops being ignored is watched once its parent
 * directory changes again.
 *
 * A directory whose real path another watcher (or this one, through another
 * path) already watches is not watched again: this watcher follows the owner,
 * whose events under that directory schedule this watcher's refresh too. When
 * the owner closes or the claimed link disappears, followers watch the
 * directory themselves. A follower relies on the owner's pruning and watch
 * budget for the shared directory.
 */
export class WorkspaceWatcher {
  readonly watcher: FSWatcher;
  readonly root: string;
  private readonly pruner: WorkspacePruner;
  private readonly budget: WatchBudget;
  private readonly owned = new Set<Claim>();
  /** This watcher's paths it leaves to another claim, by path. */
  private readonly following = new Map<string, Follower>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    root: string,
    private readonly changed: () => void,
    options: WorkspaceWatcherOptions = {},
  ) {
    this.root = resolve(root);
    this.pruner = new WorkspacePruner(this.root);
    const maxPaths = Math.max(1, options.maxPaths ?? workspaceWatchMaxPaths());
    const warn = options.warn ?? ((message: string) => logger.warn(message));
    this.budget = new WatchBudget(
      maxPaths,
      () => watchedPaths(this.watcher),
      () =>
        warn(
          `File watching reached its limit of ${maxPaths} paths under ${this.root}; ` +
            `further changes there refresh the file tree only partially. ` +
            `Set ${WORKSPACE_WATCH_MAX_PATHS_ENV} to raise the limit.`,
        ),
    );
    const real = realDirectory(this.root);
    if (real) this.enter(this.root, real);
    this.watcher = watch(this.root, {
      ignoreInitial: true,
      ignored: (path, stats) => this.ignores(path, stats),
      followSymlinks: true, // Repositories may be linked into the shared directory.
    });
    this.watcher.on('all', (event, path) => {
      this.observe(event, path);
      this.deliver(path, new Set());
    });
    this.watcher.on('error', () => {
      /* Best-effort file explorer updates. */
    });
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.closed) return;
    this.closed = true;
    for (const path of [...this.following.keys()]) this.unfollow(path);
    void this.watcher.close();
    this.release([...this.owned]);
  }

  private ignores(path: string, stats?: Stats): boolean {
    if (this.closed) return true;
    if (path === this.root) {
      if (this.following.has(path)) return true;
    } else if (this.pruner.prunes(path)) {
      return true;
    } else if (
      stats &&
      (stats.isSymbolicLink() || stats.isDirectory()) &&
      this.followsElsewhere(path, stats.isSymbolicLink())
    ) {
      return true;
    }
    return !this.budget.admit(path);
  }

  /**
   * Decides a directory before chokidar descends: true when its real
   * directory is already watched, and this watcher follows that owner.
   * Readdir stats (lstat) mark links; a plain directory's real path follows
   * from the claim this watcher reached it through.
   */
  private followsElsewhere(path: string, link: boolean): boolean {
    if (link) {
      const real = realDirectory(path);
      if (real) return this.enter(path, real);
      this.unfollow(path);
      this.releasePath(path);
      return false;
    }
    const real = this.realOf(path);
    const claim = real === null ? undefined : claims.get(real);
    if (!real || !claim || claim.owner === this) return false;
    const ownerPath = claim.owner.pathFor(claim, real);
    if (ownerPath === null) return false;
    this.follow(claim, path, real, ownerPath);
    return true;
  }

  /** Claims `real` for `path`, or follows its owner; true when following. */
  private enter(path: string, real: string): boolean {
    const claim = coveringClaim(real);
    if (claim?.owner === this && claim.path === path) return false;
    const ownerPath = claim ? claim.owner.pathFor(claim, real) : null;
    if (claim && ownerPath !== null) {
      this.follow(claim, path, real, ownerPath);
      return true;
    }
    this.unfollow(path);
    this.claim(real, path);
    return false;
  }

  /** This watcher's watched path for `real` inside `claim`, or null. */
  private pathFor(claim: Claim, real: string): string | null {
    if (this.closed) return null;
    const path =
      real === claim.real
        ? claim.path
        : join(claim.path, relative(claim.real, real));
    if (real !== claim.real && this.pruner.prunes(path)) return null;
    for (const followed of this.following.keys())
      if (isWithin(path, followed)) return null;
    return path;
  }

  /** realpath of a directory reached by plain descent from one of this watcher's claims. */
  private realOf(path: string): string | null {
    let best: Claim | undefined;
    for (const claim of this.owned) {
      if (
        isWithin(path, claim.path) &&
        (!best || claim.path.length > best.path.length)
      )
        best = claim;
    }
    return best ? join(best.real, relative(best.path, path)) : null;
  }

  private claim(real: string, path: string): void {
    this.releasePath(path);
    const claim: Claim = { real, path, owner: this, followers: new Set() };
    claims.set(real, claim);
    this.owned.add(claim);
  }

  private releasePath(path: string): void {
    const released = [...this.owned].filter((claim) => claim.path === path);
    if (released.length) this.release(released);
  }

  /** Stops owning `released`; their followers watch the directories themselves. */
  private release(released: Claim[]): void {
    const orphans: Follower[] = [];
    for (const claim of released) {
      if (claims.get(claim.real) === claim) claims.delete(claim.real);
      this.owned.delete(claim);
      orphans.push(...claim.followers);
      claim.followers.clear();
    }
    for (const follower of orphans) follower.watcher.adopt(follower);
  }

  private follow(
    claim: Claim,
    path: string,
    real: string,
    ownerPath: string,
  ): void {
    const current = this.following.get(path);
    if (
      current?.claim === claim &&
      current.real === real &&
      current.ownerPath === ownerPath
    )
      return;
    this.unfollow(path);
    const follower: Follower = { watcher: this, claim, path, real, ownerPath };
    claim.followers.add(follower);
    this.following.set(path, follower);
  }

  private unfollow(path: string): void {
    const follower = this.following.get(path);
    if (!follower) return;
    follower.claim.followers.delete(follower);
    this.following.delete(path);
  }

  /** The followed owner stopped watching the directory: watch it here. */
  private adopt(follower: Follower): void {
    if (this.closed || this.following.get(follower.path) !== follower) return;
    if (realDirectory(follower.path) !== follower.real) {
      // The link changed; the next scan of its parent decides again.
      this.following.delete(follower.path);
      return;
    }
    // Decide while still following, so this watcher's own claims do not
    // count as covering a directory it never descended into.
    const claim = coveringClaim(follower.real);
    const ownerPath = claim ? claim.owner.pathFor(claim, follower.real) : null;
    this.following.delete(follower.path);
    if (claim && ownerPath !== null) {
      this.follow(claim, follower.path, follower.real, ownerPath);
      return;
    }
    this.claim(follower.real, follower.path);
    this.watcher.add(follower.path);
    this.schedule(); // Changes during the handover were not observed.
  }

  private observe(event: string, path: string): void {
    if (basename(path) === '.gitignore') this.pruner.invalidate(dirname(path));
    else if (event === 'addDir' || event === 'unlinkDir')
      this.pruner.invalidate(path);
    if (isWithin(path, join(this.root, '.fibe')))
      this.pruner.invalidateSettings();
    if (event === 'unlink' || event === 'unlinkDir') this.releasePath(path);
  }

  /** Schedules this watcher's refresh and forwards `path` to its followers. */
  private deliver(path: string, seen: Set<Follower>): void {
    this.schedule();
    for (const claim of this.owned) {
      for (const follower of claim.followers) {
        if (seen.has(follower) || !isWithin(path, follower.ownerPath)) continue;
        seen.add(follower);
        follower.watcher.deliver(
          join(follower.path, relative(follower.ownerPath, path)),
          seen,
        );
      }
    }
  }

  private schedule(): void {
    // A fixed window also refreshes during sustained source edits, without
    // starving the UI or refreshing every 500 ms during a build.
    if (this.closed || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.changed();
    }, WORKSPACE_REFRESH_MS);
  }
}
