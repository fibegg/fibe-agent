import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { ConfigService } from '../config/config.service';
import { writeMcpConfig } from '../config/mcp-config-writer';

const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes

/** Refreshes the selected installation credential before its actual expiry. */
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

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.refreshToken();
    this.isInitialRefresh = false;

    this.scheduleRefresh();
  }

  private scheduleRefresh(): void {
    if (this.stopped) return;
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
  }

  /** Fetches a GitHub installation token and rewrites MCP config. */
  refreshToken(): Promise<string | null> {
    if (this.stopped) return Promise.resolve(null);
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
    const endpoint = ownerType === 'Team' ? 'company_git_installations' : 'installations';
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
