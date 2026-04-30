import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { runLocalPlaygroundsCli } from './local-playgrounds-cli';

export interface BrowseEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
}

@Injectable()
export class PlayroomBrowserService {
  constructor(private readonly config: ConfigService) {}

  /** List local playgrounds through the Fibe CLI. */
  async browse(relPath = ''): Promise<BrowseEntry[]> {
    if (relPath) return []; // Flattened UI workflow doesn't browse subdirectories

    try {
      const stdout = await runLocalPlaygroundsCli(this.config, ['list']);
      const lines = stdout.split('\n').filter((l: string) => l.trim().length > 0);

      const entries: BrowseEntry[] = [];
      for (const line of lines) {
         // Fallback split for older CLI just in case, but rely on whatever CLI gives
         const parts = line.split('|');
         const path = parts[0];
         const name = parts.length > 1 ? parts[1] : path;
         if (path) {
             entries.push({ name: name || path, path, type: 'directory' });
         }
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

  /** Returns the name of the playground currently active in /app/playground, or null. */
  async getCurrentLink(): Promise<string | null> {
    const playgroundDir = resolve(this.config.getPlaygroundsDir());
    const stateFile = resolve(playgroundDir, '.current_playground');
    try {
      const content = await readFile(stateFile, 'utf8');
      return content ? content.trim() : null;
    } catch {
      return null;
    }
  }
}
