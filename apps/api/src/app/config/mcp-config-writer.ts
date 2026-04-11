import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';

const getHome = () => process.env.HOME ?? '/home/node';
const getSessionDir = () => process.env.SESSION_DIR;
const logger = new Logger('McpConfigWriter');

/**
 * A single MCP server entry — either streamable-HTTP or stdio.
 *
 * Streamable HTTP: has serverUrl + optional authHeader.
 * Stdio:           has command + args.
 */
interface McpServerEntry {
  serverUrl?: string;
  authHeader?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Converts a McpServerEntry from the env var into the provider-native config
 * shape that Gemini/Claude expect inside their settings.json `mcpServers`.
 */
function toNativeJsonEntry(entry: McpServerEntry): Record<string, unknown> {
  if (entry.command) {
    // Stdio server (e.g. docker MCP) — pass through as-is
    return {
      command: entry.command,
      args: entry.args ?? [],
      ...(entry.env ? { env: entry.env } : {}),
    };
  }

  // Streamable-HTTP server — use mcp-remote proxy via auto-restart wrapper.
  // mcp-remote (v0.1.x) has no reconnection logic; if the upstream server
  // restarts the process exits and tools become permanently unavailable.
  // The wrapper script catches exits and relaunches mcp-remote automatically.
  const url = entry.serverUrl ?? '';
  const args = [url];
  if (entry.serverUrl && !entry.serverUrl.startsWith('https://')) {
    args.push('--allow-http');
  }
  if (entry.authHeader) {
    args.push('--header', `Authorization:${entry.authHeader}`);
  }
  return { command: 'mcp-remote-wrapper', args };
}

/**
 * Converts a McpServerEntry into a TOML block for OpenAI Codex config.
 */
function toTomlBlock(name: string, entry: McpServerEntry): string {
  if (entry.command) {
    // Stdio — Codex uses "type", "command" and "args" keys
    const argsQuoted = (entry.args ?? []).map((a) => `"${a}"`).join(', ');
    const lines = [
      `[mcp_servers."${name}"]`,
      `type = "stdio"`,
      `command = "${entry.command}"`,
      `args = [${argsQuoted}]`,
    ];
    if (entry.env && Object.keys(entry.env).length > 0) {
      const envParts = Object.entries(entry.env)
        .map(([k, v]) => `${k} = "${v}"`)
        .join(', ');
      lines.push(`env = { ${envParts} }`);
    }
    return lines.join('\n');
  }

  // Streamable-HTTP — Codex does not support env for url-based servers; use bearer_token_env_var if needed
  return [
    `[mcp_servers."${name}"]`,
    `url = "${entry.serverUrl}"`,
  ].join('\n');
}

// ─── Provider Writers ──────────────────────────────────────────────

/**
 * Provider-specific MCP config writers.
 * Each provider stores MCP server configuration in a different format/location.
 */
const PROVIDER_WRITERS: Record<string, (servers: Record<string, McpServerEntry>) => void> = {
  /**
   * Gemini CLI: ~/.gemini/settings.json
   * Format: { "mcpServers": { "<name>": { "command": ..., "args": [...], "env": {...} } } }
   */
  gemini: (servers) => {
    const dir = getSessionDir() || join(getHome(), '.gemini');
    const configPath = join(dir, 'settings.json');
    let existing: Record<string, unknown> = {};

    try {
      if (existsSync(configPath)) {
        existing = JSON.parse(readFileSync(configPath, 'utf8'));
      }
    } catch {
      /* start fresh */
    }

    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const nativeServers: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(servers)) {
      nativeServers[name] = toNativeJsonEntry(entry);
    }

    const config = {
      ...existing,
      mcpServers: {
        ...((existing.mcpServers as Record<string, unknown>) ?? {}),
        ...nativeServers,
      },
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    logger.log(`Wrote Gemini MCP config to ${configPath}`);
  },

  /**
   * Claude Code: writes MCP servers to BOTH config locations:
   *   1. ~/.claude/settings.json  — canonical location for Claude Code MCP servers
   *   2. ~/.claude.json           — legacy/fallback location
   *
   * Writing to both ensures tools are discovered regardless of Claude Code version.
   * Format: { "mcpServers": { "<name>": { "command": ..., "args": [...], "env": {...} } } }
   */
  'claude-code': (servers) => {
    const nativeServers: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(servers)) {
      nativeServers[name] = toNativeJsonEntry(entry);
    }

    // Write to ~/.claude/settings.json (canonical location)
    // Respect SESSION_DIR if set — strategies read config from there
    const settingsDir = getSessionDir() || join(getHome(), '.claude');
    const settingsPath = join(settingsDir, 'settings.json');
    if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true });

    let settingsExisting: Record<string, unknown> = {};
    try {
      if (existsSync(settingsPath)) {
        settingsExisting = JSON.parse(readFileSync(settingsPath, 'utf8'));
      }
    } catch {
      /* start fresh */
    }

    const settingsConfig = {
      ...settingsExisting,
      mcpServers: {
        ...((settingsExisting.mcpServers as Record<string, unknown>) ?? {}),
        ...nativeServers,
      },
    };
    writeFileSync(settingsPath, JSON.stringify(settingsConfig, null, 2));
    logger.log(`Wrote Claude MCP config to ${settingsPath}`);

    // Also write to ~/.claude.json (legacy/fallback)
    const legacyPath = join(getHome(), '.claude.json');
    let legacyExisting: Record<string, unknown> = {};
    try {
      if (existsSync(legacyPath)) {
        legacyExisting = JSON.parse(readFileSync(legacyPath, 'utf8'));
      }
    } catch {
      /* start fresh */
    }

    const legacyConfig = {
      ...legacyExisting,
      mcpServers: {
        ...((legacyExisting.mcpServers as Record<string, unknown>) ?? {}),
        ...nativeServers,
      },
    };
    writeFileSync(legacyPath, JSON.stringify(legacyConfig, null, 2));
    logger.log(`Wrote Claude MCP config to ${legacyPath}`);
  },

  /**
   * OpenAI Codex: ~/.codex/config.toml
   * Format: [mcp_servers."<name>"] with url/command and env keys (TOML)
   */
  'openai-codex': (servers) => {
    const dir = getSessionDir() || join(getHome(), '.codex');
    const configPath = join(dir, 'config.toml');
    let existingContent = '';

    try {
      if (existsSync(configPath)) {
        existingContent = readFileSync(configPath, 'utf8');
      }
    } catch {
      /* start fresh */
    }

    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    // Remove any existing [mcp_servers."..."] blocks that we're about to write.
    // Match through to the next table header or EOF so we don't cut inside args = [...].
    let cleaned = existingContent;
    for (const name of Object.keys(servers)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `(\\[mcp_servers\\."${escaped}"\\][\\s\\S]*?)(?=\\n\\[|$)`,
        'gs',
      );
      cleaned = cleaned.replace(pattern, '');
    }
    cleaned = cleaned.trim();

    const tomlBlocks = Object.entries(servers)
      .map(([name, entry]) => toTomlBlock(name, entry))
      .join('\n\n');

    const finalContent = cleaned ? `${cleaned}\n\n${tomlBlocks}\n` : `${tomlBlocks}\n`;
    writeFileSync(configPath, finalContent);
    logger.log(`Wrote Codex MCP config (TOML) to ${configPath}`);
  },

  /**
   * OpenCode: injects MCP servers into the OPENCODE_CONFIG_CONTENT env var.
   * OpenCode reads config exclusively from this env var (highest precedence).
   * The strategy's YOLO_ENV already sets base config; we merge mcpServers into it.
   */
  opencode: (servers) => {
    const existingRaw = process.env.OPENCODE_CONFIG_CONTENT;
    let existing: Record<string, unknown> = {};
    try {
      if (existingRaw) existing = JSON.parse(existingRaw);
    } catch {
      /* start fresh */
    }

    const nativeServers: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(servers)) {
      if (entry.command) {
        nativeServers[name] = {
          command: entry.command,
          args: entry.args ?? [],
          ...(entry.env ? { env: entry.env } : {}),
        };
      } else if (entry.serverUrl) {
        nativeServers[name] = { url: entry.serverUrl };
      }
    }

    const config = {
      ...existing,
      mcpServers: {
        ...((existing.mcpServers as Record<string, unknown>) ?? {}),
        ...nativeServers,
      },
    };
    process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify(config);
    logger.log('Injected MCP servers into OPENCODE_CONFIG_CONTENT env var');
  },
};

// ─── Main Entry Point ──────────────────────────────────────────────

/**
 * Parses a JSON string containing `{ mcpServers: { ... } }`.
 * Returns the inner `mcpServers` map, or null on failure.
 */
function parseServersFromJson(raw: string): Record<string, McpServerEntry> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.mcpServers && typeof parsed.mcpServers === 'object') {
      return parsed.mcpServers;
    }
    // Legacy flat format: { serverUrl, authHeader }
    if (parsed?.serverUrl) {
      return { 'playgrounds-dev': parsed as McpServerEntry };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reads MCP_CONFIG_JSON and DOCKER_MCP_CONFIG_JSON env vars and writes the
 * appropriate provider-specific MCP configuration files so the AI agent CLI
 * can connect to all configured MCP servers on startup.
 */
export function writeMcpConfig(): void {
  const rawProvider = process.env.AGENT_PROVIDER;
  if (!rawProvider) {
    const hasMcp = process.env.MCP_CONFIG_JSON || process.env.DOCKER_MCP_CONFIG_JSON;
    if (hasMcp) logger.warn('MCP config env vars are set but AGENT_PROVIDER is missing');
    return;
  }

  // Normalize: Dockerfile uses underscores (claude_code), registry uses hyphens (claude-code)
  const provider = rawProvider.replace(/_/g, '-');

  const writer = PROVIDER_WRITERS[provider];
  if (!writer) {
    logger.warn(`No MCP config writer for provider: ${provider} (raw: ${rawProvider})`);
    return;
  }

  // Collect servers from all sources
  const allServers: Record<string, McpServerEntry> = {};

  const mcpRaw = process.env.MCP_CONFIG_JSON;
  if (mcpRaw) {
    const servers = parseServersFromJson(mcpRaw);
    if (servers) Object.assign(allServers, servers);
    else logger.warn('MCP_CONFIG_JSON could not be parsed');
  }

  const dockerRaw = process.env.DOCKER_MCP_CONFIG_JSON;
  if (dockerRaw) {
    const servers = parseServersFromJson(dockerRaw);
    if (servers) Object.assign(allServers, servers);
    else logger.warn('DOCKER_MCP_CONFIG_JSON could not be parsed');
  }

  if (Object.keys(allServers).length === 0) return;

  try {
    writer(allServers);
  } catch (err) {
    logger.error(`Failed to write MCP config: ${err}`);
  }
}
