import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { execSync } from 'node:child_process';
import { ConfigService } from '../config/config.service';
import { writeMcpConfig } from '../config/mcp-config-writer';

const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes

/** Refreshes the hourly GitHub token every 50 minutes and restarts its MCP server. */
@Injectable()
export class GithubTokenRefreshService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(GithubTokenRefreshService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private isInitialRefresh = true;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.refreshToken();
    this.isInitialRefresh = false;

    this.timer = setInterval(() => {
      void this.refreshToken();
    }, REFRESH_INTERVAL_MS);

    this.logger.log(
      `GitHub token refresh scheduled every ${REFRESH_INTERVAL_MS / 60000} minutes`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Fetches a GitHub installation token and rewrites MCP config. */
  async refreshToken(): Promise<string | null> {
    const apiUrl = this.config.getFibeApiUrl();
    const apiKey = this.config.getFibeApiKey();
    const agentId = this.config.getFibeAgentId();

    if (!apiUrl || !apiKey || !agentId) {
      this.logger.debug(
        'Fibe API config missing: skipping GitHub token refresh',
      );
      return null;
    }

    const url = `${apiUrl}/api/agents/${agentId}/github_token`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!res.ok) {
        if (res.status === 404) {
          this.logger.debug('No GitHub App installation for this agent owner');
          return null;
        }
        this.logger.warn(
          `GitHub token refresh failed: ${res.status} ${res.statusText}`,
        );
        return null;
      }

      const data = (await res.json()) as {
        token?: string;
        expires_in?: number;
      };
      const token = data.token;

      if (!token) {
        this.logger.warn('GitHub token response missing token field');
        return null;
      }

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
      this.logger.warn(`GitHub token refresh error: ${err}`);
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

    servers['github'] = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: token },
    };

    config.mcpServers = servers;
    process.env.MCP_CONFIG_JSON = JSON.stringify(config);
  }

  /** Stops server-github so the CLI respawns it with the new token. */
  private killGithubMcpServer(): void {
    try {
      execSync('pkill -f "server-github" 2>/dev/null || true', {
        timeout: 5000,
      });
      this.logger.log(
        'Killed running GitHub MCP server: will respawn with fresh token',
      );
    } catch {
      // No matching process is a valid state.
    }
  }
}
