import { lstat, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { runLocalPlaygroundsCli } from './local-playgrounds-cli';

export interface BrowseEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
}

interface LocalPlaygroundName {
  id?: string;
  name: string;
  playspec?: string;
  path?: string;
}

interface CurrentPlaygroundState {
  id?: string;
  name?: string;
  dir_name?: string;
  playspec?: string;
}

interface LocalPlaygroundMount {
  service?: string;
  mount?: string;
}

@Injectable()
export class PlayroomBrowserService {
  constructor(private readonly config: ConfigService) {}

  /** List local playgrounds through the Fibe CLI. */
  async browse(relPath = ''): Promise<BrowseEntry[]> {
    if (relPath) return []; // Flattened UI workflow doesn't browse subdirectories

    try {
      const stdout = await runLocalPlaygroundsCli(this.config, ['info', '--view', 'names']);
      const items = JSON.parse(stdout) as LocalPlaygroundName[];
      const seen = new Set<string>();
      const entries: BrowseEntry[] = [];

      for (const item of items) {
        const name = item.name?.trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        entries.push({
          name,
          path: name,
          type: 'directory',
        });
      }

      return entries;
    } catch {
      throw new NotFoundException(`Cannot execute Fibe local playgrounds command.`);
    }
  }

  /**
   * Link the target services to /app/playground through the Fibe CLI.
   *
   * Throws:
   *  - BadRequestException  if relPath is empty / invalid
   */
  async linkPlayground(relPath: string): Promise<{ linkedPath: string }> {
    if (!relPath?.trim()) {
      throw new BadRequestException('Path is required');
    }


    try {
      const linkDir = resolve(this.config.getPlaygroundsDir());

      // Trust the Fibe CLI to do all validation and linking
      await runLocalPlaygroundsCli(this.config, ['link', relPath, '--link-dir', linkDir]);

    } catch (err: unknown) {
      const e = err as Error;
      throw new BadRequestException(
        `Failed to link playground via Fibe CLI: ${e.message}`,
      );
    }

    return { linkedPath: relPath };
  }

  async unlinkPlayground(confirm: boolean): Promise<void> {
    if (!confirm) {
      throw new BadRequestException('unlink requires confirm=true');
    }

    const playgroundDir = resolve(this.config.getPlaygroundsDir());
    let info;
    try {
      info = await lstat(playgroundDir);
    } catch (err: unknown) {
      const e = err as Error;
      throw new BadRequestException(`Failed to unlink playground: ${e.message}`);
    }

    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new BadRequestException(`Failed to unlink playground: ${playgroundDir} is not a directory`);
    }

    const entries = await readdir(playgroundDir, { withFileTypes: true });
    await Promise.all(entries.map((entry) => rm(resolve(playgroundDir, entry.name), { recursive: true, force: true })));
  }

  /** Returns the name of the playground currently active in /app/playground, or null. */
  async getCurrentLink(): Promise<string | null> {
    const playgroundDir = resolve(this.config.getPlaygroundsDir());
    const stateFile = resolve(playgroundDir, '.current_playground.json');
    try {
      const content = await readFile(stateFile, 'utf8');
      const state = JSON.parse(content) as CurrentPlaygroundState;
      return state.name || state.dir_name || state.id || state.playspec || null;
    } catch {
      return this.inferCurrentLinkFromMountedTargets(playgroundDir);
    }
  }

  private async inferCurrentLinkFromMountedTargets(playgroundDir: string): Promise<string | null> {
    const mountedTargets = await this.realMountedTargets(playgroundDir);
    if (mountedTargets.size === 0) return null;

    let playgrounds: LocalPlaygroundName[];
    try {
      const stdout = await runLocalPlaygroundsCli(this.config, ['info', '--view', 'names']);
      playgrounds = JSON.parse(stdout) as LocalPlaygroundName[];
    } catch {
      return null;
    }

    const matches: string[] = [];
    for (const playground of playgrounds) {
      const name = playground.name?.trim();
      if (!name) continue;

      try {
        const stdout = await runLocalPlaygroundsCli(this.config, ['info', '--view', 'mounts', '--playground', name]);
        const mounts = JSON.parse(stdout) as LocalPlaygroundMount[];
        const mountTargets = await this.realMountTargets(mounts);
        if (this.allMountedTargetsBelongToPlayground(mountedTargets, mountTargets)) {
          matches.push(name);
        }
      } catch {
        // Ignore malformed or unavailable playground records and continue.
      }
    }

    return matches.length === 1 ? matches[0] : null;
  }

  private async realMountedTargets(playgroundDir: string): Promise<Set<string>> {
    const targets = new Set<string>();
    let entries;
    try {
      entries = await readdir(playgroundDir, { withFileTypes: true });
    } catch {
      return targets;
    }

    for (const entry of entries) {
      if (entry.name === '.current_playground.json') continue;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      try {
        targets.add(await realpath(resolve(playgroundDir, entry.name)));
      } catch {
        // Ignore broken links or paths removed while scanning.
      }
    }
    return targets;
  }

  private async realMountTargets(mounts: LocalPlaygroundMount[]): Promise<Set<string>> {
    const targets = new Set<string>();
    for (const mount of mounts) {
      const raw = mount.mount?.trim();
      if (!raw) continue;
      try {
        targets.add(await realpath(raw));
      } catch {
        targets.add(resolve(raw));
      }
    }
    return targets;
  }

  private allMountedTargetsBelongToPlayground(mountedTargets: Set<string>, mountTargets: Set<string>): boolean {
    if (mountedTargets.size === 0 || mountTargets.size === 0) return false;
    for (const target of mountedTargets) {
      if (!mountTargets.has(target)) return false;
    }
    return true;
  }
}
