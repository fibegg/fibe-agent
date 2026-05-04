import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ConversationDataDirProvider } from './strategy.types';

export interface ProviderConversationPathsOptions {
  conversationDataDir?: ConversationDataDirProvider;
  workspaceSubdir: string;
  fallbackWorkspaceDir: string;
  sessionMarkerFile: string;
}

/**
 * Shared provider path policy:
 * - workspace is shared from the default conversation data dir when available;
 * - native provider session markers live in the active conversation data dir;
 * - the default/no-provider cases can read legacy markers from the workspace.
 */
export class ProviderConversationPaths {
  constructor(private readonly options: ProviderConversationPathsOptions) {}

  getWorkspaceDir(): string {
    const sharedDataDir =
      this.options.conversationDataDir?.getDefaultConversationDataDir?.()
      ?? this.options.conversationDataDir?.getConversationDataDir();
    if (sharedDataDir) return join(sharedDataDir, this.options.workspaceSubdir);
    return this.options.fallbackWorkspaceDir;
  }

  getConversationStateDir(): string | null {
    return this.options.conversationDataDir?.getConversationDataDir() ?? null;
  }

  getSessionMarkerPath(): string {
    const stateDir = this.getConversationStateDir();
    if (stateDir) return join(stateDir, this.options.sessionMarkerFile);
    return this.getLegacyWorkspaceMarkerPath();
  }

  getLegacyWorkspaceMarkerPath(): string {
    return join(this.getWorkspaceDir(), this.options.sessionMarkerFile);
  }

  prepareWorkspace(): void {
    const workspaceDir = this.getWorkspaceDir();
    if (!existsSync(workspaceDir)) mkdirSync(workspaceDir, { recursive: true });
  }

  readSessionMarker(): string | null {
    return this.readMarker(this.getSessionMarkerPath())
      ?? (this.shouldReadLegacyWorkspaceMarker()
        ? this.readMarker(this.getLegacyWorkspaceMarkerPath())
        : null);
  }

  writeSessionMarker(sessionId: string): void {
    const markerPath = this.getSessionMarkerPath();
    mkdirSync(dirname(markerPath), { recursive: true });
    writeFileSync(markerPath, sessionId, { mode: 0o600 });
  }

  clearSessionMarker(): void {
    this.removeMarker(this.getSessionMarkerPath());
    if (this.shouldReadLegacyWorkspaceMarker()) {
      this.removeMarker(this.getLegacyWorkspaceMarkerPath());
    }
  }

  private shouldReadLegacyWorkspaceMarker(): boolean {
    const provider = this.options.conversationDataDir;
    if (!provider) return true;
    if (provider.getConversationId?.() === 'default') return true;
    const defaultDir = provider.getDefaultConversationDataDir?.();
    return Boolean(defaultDir && defaultDir === provider.getConversationDataDir());
  }

  private readMarker(path: string): string | null {
    try {
      if (!existsSync(path)) return null;
      return readFileSync(path, 'utf8').trim() || null;
    } catch {
      return null;
    }
  }

  private removeMarker(path: string): void {
    try {
      if (existsSync(path)) rmSync(path, { force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }
}
