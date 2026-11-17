import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { ConfigService } from '../config/config.service';
import { writeMcpConfig } from '../config/mcp-config-writer';
import {
  configureGitCredentialHelper,
  GitCredentialStore,
  githubAccount,
} from './github-git-credentials';

const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes

/** One installation of FIBE_GITHUB_CONNECTION_IDS with its own token state. */
interface Installation {
  id: string;
  token: string | null;
  account: string | null;
  expiresAt: number;
  nextRefreshMs: number;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
}

/** The installations FIBE_GITHUB_CONNECTION_IDS names, in order, once each. */
function connectionIds(): string[] {
  const ids = (process.env.FIBE_GITHUB_CONNECTION_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^-?[1-9]\d*$/.test(id));
  return [...new Set(ids)];
}

/**
 * Refreshes the selected installation credential before its actual expiry.
 *
 * With FIBE_GITHUB_CONNECTION_IDS (a Team Agent on a server that lists every
 * installation its Team can use) each installation keeps its own token, expiry
 * and backoff. The first one holding a token is the primary: it goes to the
 * GitHub MCP server and GH_TOKEN. Git chooses the token of the repository's
 * organization through a credential helper. Without the list only
 * FIBE_GITHUB_CONNECTION_ID is refreshed, as before.
 */
@Injectable()
export class GithubTokenRefreshService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(GithubTokenRefreshService.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private inFlight: Promise<string | null> | null = null;
  private readonly abort = new AbortController();
  private nextRefreshMs = REFRESH_INTERVAL_MS;
  private expiresAt = Date.now() + 60 * 60 * 1000;
  private isInitialRefresh = true;
  private installations = new Map<string, Installation>();
  private store: GitCredentialStore | null = null;
  private storeUnavailable = false;
  private publishedPrimary = '';
  private clearPending = false;
  // An authored GH_TOKEN or GITHUB_TOKEN is the operator's choice; keep it.
  private readonly managesGhToken =
    !process.env.GH_TOKEN && !process.env.GITHUB_TOKEN;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.refreshToken();
    this.isInitialRefresh = false;

    this.scheduleRefresh();
  }

  private scheduleRefresh(): void {
    if (this.stopped) return;
    if (this.installations.size > 0) {
      for (const installation of this.installations.values())
        this.scheduleInstallation(installation);
      return;
    }
    this.timer = setTimeout(async () => {
      await this.refreshToken();
      this.scheduleRefresh();
    }, this.nextRefreshMs);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    this.abort.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const installation of this.installations.values()) {
      if (installation.timer) clearTimeout(installation.timer);
      installation.timer = null;
    }
    this.store?.remove();
    this.store = null;
  }

  /** Fetches a GitHub installation token and rewrites MCP config. */
  refreshToken(): Promise<string | null> {
    if (this.stopped) return Promise.resolve(null);
    const ids = connectionIds();
    if (ids.length > 0) return this.refreshInstallations(ids);
    this.inFlight ??= this.fetchToken().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async fetchToken(): Promise<string | null> {
    const apiUrl = this.config.getFibeApiUrl();
    const apiKey = this.config.getFibeApiKey();
    const connectionId = process.env.FIBE_GITHUB_CONNECTION_ID;

    if (!apiUrl || !apiKey || !connectionId?.match(/^[1-9]\d*$/)) {
      this.logger.debug(
        'Fibe API config missing: skipping GitHub token refresh',
      );
      return null;
    }

    const ownerType = process.env.FIBE_GITHUB_CONNECTION_OWNER;
    if (ownerType && ownerType !== 'Team') {
      this.clearToken();
      this.logger.warn('GitHub connection owner is invalid');
      return null;
    }
    const endpoint = ownerType === 'Team' ? 'team_git_installations' : 'installations';
    const url = `${apiUrl}/api/${endpoint}/${connectionId}/token`;
    this.nextRefreshMs = 60_000;

    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.any([
          this.abort.signal,
          AbortSignal.timeout(30_000),
        ]),
        headers: {
          ...this.config.getFibeOwnerProofHeaders?.(),
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (this.stopped) return null;
      if (!res.ok) {
        if (
          [401, 403, 404].includes(res.status) ||
          Date.now() >= this.expiresAt
        ) {
          this.clearToken();
        }
        this.logger.warn(`GitHub token refresh failed: ${res.status}`);
        return null;
      }

      const data = (await res.json()) as {
        token?: string;
        expires_in?: number;
      };
      const token = data.token;

      const lifetime = data.expires_in;
      if (
        typeof token !== 'string' ||
        !token ||
        typeof lifetime !== 'number' ||
        !Number.isFinite(lifetime) ||
        lifetime <= 0
      ) {
        if (!this.stopped && Date.now() >= this.expiresAt) this.clearToken();
        this.logger.warn('GitHub token response missing valid token or expiry');
        return null;
      }

      if (this.stopped) return null;
      this.expiresAt = Date.now() + lifetime * 1000;
      this.nextRefreshMs = Math.max(
        30_000,
        Math.min(REFRESH_INTERVAL_MS, lifetime * 1000 - 300_000),
      );
      this.updateGithubTokenInMcpConfig(token);
      writeMcpConfig();

      if (!this.isInitialRefresh) {
        this.killGithubMcpServer();
      }

      this.logger.log(
        `GitHub token refreshed (expires in ${data.expires_in ?? '?'}s)`,
      );
      return token;
    } catch (err) {
      if (!this.stopped) {
        if (Date.now() >= this.expiresAt) this.clearToken();
        this.logger.warn(
          `GitHub token refresh error: ${err instanceof Error ? err.name : 'unknown'}`,
        );
      }
      return null;
    }
  }

  /** Refreshes every listed installation; resolves to the primary token. */
  private async refreshInstallations(ids: string[]): Promise<string | null> {
    const previous = this.installations;
    this.installations = new Map(
      ids.map((id) => [
        id,
        previous.get(id) ?? {
          id,
          token: null,
          account: null,
          expiresAt: Date.now() + 60 * 60 * 1000,
          nextRefreshMs: REFRESH_INTERVAL_MS,
          timer: null,
          inFlight: null,
        },
      ]),
    );
    for (const [id, installation] of previous) {
      if (!this.installations.has(id) && installation.timer)
        clearTimeout(installation.timer);
    }
    const endpoint = this.installationEndpoint();
    if (!endpoint) return null;
    await Promise.all(
      [...this.installations.values()].map((installation) =>
        this.refreshInstallation(installation, endpoint),
      ),
    );
    if (this.stopped) return null;
    this.publish();
    return this.primary()?.token ?? null;
  }

  private scheduleInstallation(installation: Installation): void {
    if (this.stopped) return;
    if (installation.timer) clearTimeout(installation.timer);
    installation.timer = setTimeout(async () => {
      installation.timer = null;
      const endpoint = this.installationEndpoint();
      if (endpoint) {
        await this.refreshInstallation(installation, endpoint);
        if (!this.stopped) this.publish();
      }
      if (this.installations.get(installation.id) === installation)
        this.scheduleInstallation(installation);
    }, installation.nextRefreshMs);
  }

  /** The token endpoint path, or null when nothing may be requested. */
  private installationEndpoint(): string | null {
    if (this.stopped) return null;
    const apiUrl = this.config.getFibeApiUrl();
    const apiKey = this.config.getFibeApiKey();
    if (!apiUrl || !apiKey) {
      this.logger.debug(
        'Fibe API config missing: skipping GitHub token refresh',
      );
      return null;
    }
    const ownerType = process.env.FIBE_GITHUB_CONNECTION_OWNER;
    if (ownerType && ownerType !== 'Team') {
      for (const installation of this.installations.values())
        installation.token = null;
      this.clearPending = true;
      this.publish();
      this.logger.warn('GitHub connection owner is invalid');
      return null;
    }
    this.prepareGitCredentials();
    return ownerType === 'Team' ? 'team_git_installations' : 'installations';
  }

  private refreshInstallation(
    installation: Installation,
    endpoint: string,
  ): Promise<void> {
    installation.inFlight ??= this.fetchInstallation(
      installation,
      endpoint,
    ).finally(() => {
      installation.inFlight = null;
    });
    return installation.inFlight;
  }

  /** One installation's refresh, with the single-connection failure rules. */
  private async fetchInstallation(
    installation: Installation,
    endpoint: string,
  ): Promise<void> {
    const apiUrl = this.config.getFibeApiUrl();
    const apiKey = this.config.getFibeApiKey();
    const url = `${apiUrl}/api/${endpoint}/${installation.id}/token`;
    const expire = () => {
      installation.token = null;
      this.clearPending = true;
    };
    installation.nextRefreshMs = 60_000;

    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.any([
          this.abort.signal,
          AbortSignal.timeout(30_000),
        ]),
        headers: {
          ...this.config.getFibeOwnerProofHeaders?.(),
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (this.stopped) return;
      if (!res.ok) {
        if (
          [401, 403, 404].includes(res.status) ||
          Date.now() >= installation.expiresAt
        ) {
          expire();
        }
        this.logger.warn(
          `GitHub token refresh failed for installation ${installation.id}: ${res.status}`,
        );
        return;
      }

      const data = (await res.json()) as {
        token?: string;
        expires_in?: number;
        account?: unknown;
      };
      const token = data.token;
      const lifetime = data.expires_in;
      if (
        typeof token !== 'string' ||
        !token ||
        typeof lifetime !== 'number' ||
        !Number.isFinite(lifetime) ||
        lifetime <= 0
      ) {
        if (!this.stopped && Date.now() >= installation.expiresAt) expire();
        this.logger.warn(
          `GitHub token response for installation ${installation.id} missing valid token or expiry`,
        );
        return;
      }

      if (this.stopped) return;
      installation.token = token;
      installation.account =
        githubAccount(data.account) ?? installation.account;
      installation.expiresAt = Date.now() + lifetime * 1000;
      installation.nextRefreshMs = Math.max(
        30_000,
        Math.min(REFRESH_INTERVAL_MS, lifetime * 1000 - 300_000),
      );
      this.logger.log(
        `GitHub token refreshed for installation ${installation.id} (expires in ${lifetime}s)`,
      );
    } catch (err) {
      if (!this.stopped) {
        if (Date.now() >= installation.expiresAt) expire();
        this.logger.warn(
          `GitHub token refresh error for installation ${installation.id}: ${err instanceof Error ? err.name : 'unknown'}`,
        );
      }
    }
  }

  /** The first listed installation that currently holds a token. */
  private primary(): Installation | undefined {
    return [...this.installations.values()].find(({ token }) => token);
  }

  /**
   * Hands the current tokens to their consumers: every token to the Git
   * credential helper, the primary one to GH_TOKEN and the GitHub MCP server.
   * The MCP server restarts only when its token changes after initialization,
   * or when its token is withdrawn.
   */
  private publish(): void {
    const primary = this.primary()?.token ?? '';
    const clear = primary === '' && this.clearPending;
    this.clearPending = false;
    this.store?.write(
      [...this.installations.values()].flatMap(({ account, token }) =>
        token ? [{ account, token }] : [],
      ),
    );
    if (this.managesGhToken) {
      if (primary) process.env.GH_TOKEN = primary;
      else delete process.env.GH_TOKEN;
    }
    if (primary === this.publishedPrimary && !clear) return;
    this.publishedPrimary = primary;
    this.updateGithubTokenInMcpConfig(primary);
    writeMcpConfig();
    if (!this.isInitialRefresh || !primary) this.killGithubMcpServer();
  }

  /** Points Git at the per-organization helper once per process. */
  private prepareGitCredentials(): void {
    if (this.store || this.storeUnavailable) return;
    try {
      this.store = new GitCredentialStore();
      if (!configureGitCredentialHelper(this.store.helper)) {
        this.logger.warn(
          'GIT_CONFIG_COUNT is malformed: Git keeps its own credentials',
        );
      }
    } catch (err) {
      this.store?.remove();
      this.store = null;
      this.storeUnavailable = true;
      this.logger.warn(
        `Git credential helper unavailable: ${err instanceof Error ? err.name : 'unknown'}`,
      );
    }
  }

  /**
   * Patches the MCP_CONFIG_JSON env var to include the fresh GitHub token.
   * If the github server entry already exists, updates the token.
   * If it doesn't exist, adds it.
   */
  private updateGithubTokenInMcpConfig(token: string): void {
    const mcpRaw = process.env.MCP_CONFIG_JSON;
    let config: Record<string, unknown>;

    try {
      config = mcpRaw ? JSON.parse(mcpRaw) : {};
    } catch {
      config = {};
    }

    const servers = (config.mcpServers as Record<string, unknown>) ?? {};

    const existing = servers['github'] as Record<string, unknown> | undefined;
    servers['github'] = {
      ...(existing ?? { command: 'mcp-github' }),
      env: {
        ...((existing?.env as Record<string, string> | undefined) ?? {}),
        GITHUB_PERSONAL_ACCESS_TOKEN: token,
      },
    };

    config.mcpServers = servers;
    process.env.MCP_CONFIG_JSON = JSON.stringify(config);
  }

  private clearToken(): void {
    // Overwrite the managed entry: provider writers merge existing files, so
    // deleting only the in-memory entry would leave the old credential on disk.
    this.updateGithubTokenInMcpConfig('');
    writeMcpConfig();
    this.killGithubMcpServer();
  }

  /** mcp-github execs this installed official binary. */
  private killGithubMcpServer(): void {
    try {
      execFileSync('pkill', ['-f', '^/usr/local/bin/github-mcp-server stdio'], {
        timeout: 5000,
        stdio: 'ignore',
      });
    } catch {
      // No matching process is a valid state.
    }
  }
}
