import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { execSync } from 'node:child_process';
import { ConfigService } from '../config/config.service';
import { writeMcpConfig } from '../config/mcp-config-writer';

const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes

/**
 * Periodically fetches a fresh GitHub token from the Phoenix API
 * and updates the MCP config so the GitHub MCP server always has
 * a valid token. Runs every ~50 minutes (installation tokens last 1 hour).
 *
 * After updating the config files, kills the running server-github process
 * so the AI CLI respawns it with the fresh token.
 */
@Injectable()
export class GithubTokenRefreshService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GithubTokenRefreshService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private isInitialRefresh = true;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    // Initial refresh at startup
    await this.refreshToken();
    this.isInitialRefresh = false;

    // Schedule periodic refresh
    this.timer = setInterval(() => {
      void this.refreshToken();
    }, REFRESH_INTERVAL_MS);

    this.logger.log(
      `GitHub token refresh scheduled every ${REFRESH_INTERVAL_MS / 60000} minutes`
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Fetches a fresh GitHub installation token from Phoenix API
   * and rewrites the MCP config with the new token.
   */
  async refreshToken(): Promise<string | null> {
    const apiUrl = this.config.getPhoenixApiUrl();
    const apiKey = this.config.getPhoenixApiKey();
    const agentId = this.config.getPhoenixAgentId();

    if (!apiUrl || !apiKey || !agentId) {
      this.logger.debug(
        'Phoenix API config missing — skipping GitHub token refresh'
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
        // 404 = no GitHub App installed, not an error
        if (res.status === 404) {
          this.logger.debug('No GitHub App installation for this agent owner');
          return null;
        }
        this.logger.warn(
          `GitHub token refresh failed: ${res.status} ${res.statusText}`
        );
        return null;
      }

      const data = (await res.json()) as { token?: string; expires_in?: number };
      const token = data.token;

      if (!token) {
        this.logger.warn('GitHub token response missing token field');
        return null;
      }

      // Update the MCP config JSON env var with the fresh token, then rewrite config
      this.updateGithubTokenInMcpConfig(token);
      writeMcpConfig();

      // On periodic refreshes (not initial), kill the running GitHub MCP server
      // so the AI CLI respawns it with the fresh token from the updated config
      if (!this.isInitialRefresh) {
        this.killGithubMcpServer();
      }

      this.logger.log(
        `GitHub token refreshed (expires in ${data.expires_in ?? '?'}s)`
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

  /**
   * Kills any running server-github MCP process so the AI CLI will
   * respawn it with the fresh token from the updated config files.
   * Uses pkill to find processes matching the GitHub MCP server package name.
   * Failures are silently ignored (process may not be running).
   */
  private killGithubMcpServer(): void {
    try {
      execSync('pkill -f "server-github" 2>/dev/null || true', {
        timeout: 5000,
      });
      this.logger.log('Killed running GitHub MCP server — will respawn with fresh token');
    } catch {
      // Process not running or pkill not available — both are fine
    }
  }
}
