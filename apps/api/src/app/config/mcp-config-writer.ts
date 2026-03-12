import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';

const getHome = () => process.env.HOME ?? '/home/node';
const logger = new Logger('McpConfigWriter');

interface McpEnvelope {
  serverUrl: string;
  authHeader: string;
}

/**
 * Provider-specific MCP config writers.
 * Each provider stores MCP server configuration in a different format/location.
 */
const PROVIDER_WRITERS: Record<string, (envelope: McpEnvelope) => void> = {
  /**
   * Gemini CLI: ~/.gemini/settings.json
   * Format: { "mcpServers": { "<name>": { "command": ..., "args": [...], "env": {...} } } }
   */
  gemini: (env) => {
    const dir = join(getHome(), '.gemini');
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

    const config = {
      ...existing,
      mcpServers: {
        ...((existing.mcpServers as Record<string, unknown>) ?? {}),
        playgrounds: {
          command: 'npx',
          args: ['-y', 'mcp-remote', env.serverUrl],
          env: { AUTHORIZATION: env.authHeader },
        },
      },
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    logger.log(`Wrote Gemini MCP config to ${configPath}`);
  },

  /**
   * Claude Code: ~/.claude/settings.json
   * Format: { "mcpServers": { "<name>": { "command": ..., "args": [...], "env": {...} } } }
   */
  'claude-code': (env) => {
    const dir = join(getHome(), '.claude');
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

    const config = {
      ...existing,
      mcpServers: {
        ...((existing.mcpServers as Record<string, unknown>) ?? {}),
        playgrounds: {
          command: 'npx',
          args: ['-y', 'mcp-remote', env.serverUrl],
          env: { AUTHORIZATION: env.authHeader },
        },
      },
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    logger.log(`Wrote Claude MCP config to ${configPath}`);
  },

  /**
   * OpenAI Codex: ~/.codex/config.toml
   * Format: [mcp_servers."<name>"] with url and env keys (TOML)
   */
  'openai-codex': (env) => {
    const dir = join(getHome(), '.codex');
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

    // Remove any existing [mcp_servers."playgrounds"] block
    const cleaned = existingContent
      .replace(/\[mcp_servers\."playgrounds"\][^[]*/gs, '')
      .trim();

    const tomlBlock = [
      '[mcp_servers."playgrounds"]',
      `url = "${env.serverUrl}"`,
      `env = { AUTHORIZATION = "${env.authHeader}" }`,
    ].join('\n');

    const finalContent = cleaned
      ? `${cleaned}\n\n${tomlBlock}\n`
      : `${tomlBlock}\n`;
    writeFileSync(configPath, finalContent);
    logger.log(`Wrote Codex MCP config (TOML) to ${configPath}`);
  },
};

/**
 * Reads MCP_CONFIG_JSON env var and writes the appropriate provider-specific
 * MCP configuration file so the AI agent CLI can connect to the Playgrounds
 * MCP server on startup.
 */
export function writeMcpConfig(): void {
  const raw = process.env.MCP_CONFIG_JSON;
  if (!raw) return;

  const provider = process.env.AGENT_PROVIDER;
  if (!provider) {
    logger.warn('MCP_CONFIG_JSON is set but AGENT_PROVIDER is missing');
    return;
  }

  const writer = PROVIDER_WRITERS[provider];
  if (!writer) {
    logger.warn(`No MCP config writer for provider: ${provider}`);
    return;
  }

  try {
    const envelope: McpEnvelope = JSON.parse(raw);
    if (!envelope.serverUrl || !envelope.authHeader) {
      logger.warn('MCP_CONFIG_JSON is missing serverUrl or authHeader');
      return;
    }
    writer(envelope);
  } catch (err) {
    logger.error(`Failed to write MCP config: ${err}`);
  }
}
