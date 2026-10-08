import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Logger } from '@nestjs/common';

const getHome = () => process.env.HOME ?? '/home/node';
const getSessionDir = () => process.env.SESSION_DIR;
const CLAUDE_WORKSPACE_SUBDIR = 'claude_workspace';
const CURSOR_WORKSPACE_SUBDIR = 'cursor_workspace';
const logger = new Logger('McpConfigWriter');
const CLAUDE_SKIP_DANGEROUS_MODE_PROMPT_KEY =
  'skipDangerousModePermissionPrompt';

/** A streamable-HTTP entry has serverUrl; a stdio entry has command and args. */
interface McpServerEntry {
  serverUrl?: string;
  authHeader?: string;
  bearerTokenEnvVar?: string;
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  envHeaders?: Record<string, string>;
}

function toNativeJsonEntry(entry: McpServerEntry): Record<string, unknown> {
  if (entry.command) {
    return {
      command: entry.command,
      args: entry.args ?? [],
      ...(entry.env ? { env: entry.env } : {}),
    };
  }

  // mcp-remote 0.1.x exits after an upstream restart, so the wrapper relaunches it.
  const url = entry.serverUrl ?? '';
  const args = [url];
  if (entry.serverUrl && !entry.serverUrl.startsWith('https://')) {
    args.push('--allow-http');
  }
  if (entry.authHeader) {
    args.push('--header', `Authorization:${entry.authHeader}`);
  }
  for (const [name, value] of Object.entries(entry.headers ?? {})) {
    args.push('--header', `${name}:${value}`);
  }
  for (const [name, variable] of Object.entries(entry.envHeaders ?? {})) {
    const value = process.env[variable];
    if (value !== undefined) args.push('--header', `${name}:${value}`);
  }
  return { command: 'mcp-remote-wrapper', args };
}

function toClaudeProjectJsonEntry(
  entry: McpServerEntry,
): Record<string, unknown> {
  const native = toNativeJsonEntry(entry);
  if (native.command) {
    return {
      type: entry.type ?? 'stdio',
      ...native,
    };
  }

  return native;
}

function toAntigravityJsonEntry(
  entry: McpServerEntry,
): Record<string, unknown> {
  return {
    ...(entry.serverUrl ? { serverUrl: entry.serverUrl } : {}),
    ...(entry.authHeader ? { authHeader: entry.authHeader } : {}),
    ...(entry.bearerTokenEnvVar
      ? { bearerTokenEnvVar: entry.bearerTokenEnvVar }
      : {}),
    ...(entry.type ? { type: entry.type } : {}),
    ...(entry.command ? { command: entry.command } : {}),
    ...(entry.args ? { args: entry.args } : {}),
    ...(entry.env ? { env: entry.env } : {}),
  };
}

function escapeTomlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function quotedTomlString(value: string): string {
  return `"${escapeTomlString(value)}"`;
}

function sanitizeConversationId(id: string): string {
  const sanitized = id
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return sanitized || 'default';
}

function getDataDir(): string {
  return process.env.DATA_DIR ?? join(process.cwd(), 'data');
}

function getConversationId(): string {
  const raw =
    process.env.FIBE_AGENT_ID?.trim() ||
    process.env.CONVERSATION_ID?.trim() ||
    '';
  return raw || 'default';
}

function truthy(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function june1815Enabled(): boolean {
  return truthy(process.env.JUNE1815_ENABLED);
}

function getClaudeProjectMcpConfigPath(): string {
  const conversationId = getConversationId();
  return join(
    getDataDir(),
    sanitizeConversationId(conversationId),
    CLAUDE_WORKSPACE_SUBDIR,
    '.mcp.json',
  );
}

function getCursorMcpConfigPath(): string {
  const hasConversationId = !!(
    process.env.FIBE_AGENT_ID?.trim() || process.env.CONVERSATION_ID?.trim()
  );
  if (!hasConversationId) {
    return join(getSessionDir() || join(getHome(), '.cursor'), 'mcp.json');
  }

  const conversationId = getConversationId();
  return join(
    getDataDir(),
    sanitizeConversationId(conversationId),
    CURSOR_WORKSPACE_SUBDIR,
    '.cursor',
    'mcp.json',
  );
}

function codexBearerTokenEnvVar(entry: McpServerEntry): string | null {
  if (entry.bearerTokenEnvVar) {
    return entry.bearerTokenEnvVar;
  }
  if (!entry.authHeader) {
    return null;
  }

  const envPlaceholder = entry.authHeader.match(
    /^Bearer\s+\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/,
  );
  if (envPlaceholder) {
    return envPlaceholder[1];
  }

  const rawPlaceholder = entry.authHeader.match(
    /^Bearer\s+\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/,
  );
  if (rawPlaceholder) {
    return rawPlaceholder[1];
  }

  return null;
}

function opencodeAuthorizationHeader(entry: McpServerEntry): string | null {
  if (entry.bearerTokenEnvVar) {
    return `Bearer {env:${entry.bearerTokenEnvVar}}`;
  }
  if (!entry.authHeader) {
    return null;
  }

  const envPlaceholder = entry.authHeader.match(
    /^Bearer\s+\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/,
  );
  if (envPlaceholder) {
    return `Bearer {env:${envPlaceholder[1]}}`;
  }

  const rawPlaceholder = entry.authHeader.match(
    /^Bearer\s+\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/,
  );
  if (rawPlaceholder) {
    return `Bearer {env:${rawPlaceholder[1]}}`;
  }

  return entry.authHeader;
}

function stripManagedCodexBlocks(
  content: string,
  serverNames: string[],
): string {
  if (!content.trim()) {
    return '';
  }

  const names = new Set(serverNames);
  const lines = content.split('\n');
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const header = line.match(/^\[mcp_servers\."((?:[^"\\]|\\.)+)"\]\s*$/);
    if (header) {
      skipping = names.has(header[1]);
      if (skipping) {
        continue;
      }
    } else if (skipping && /^\[/.test(line)) {
      skipping = false;
    }

    if (!skipping) {
      kept.push(line);
    }
  }

  return kept.join('\n').trim();
}

function toTomlBlock(name: string, entry: McpServerEntry): string {
  if (entry.command) {
    const argsQuoted = (entry.args ?? [])
      .map((a) => quotedTomlString(a))
      .join(', ');
    const lines = [
      `[mcp_servers.${quotedTomlString(name)}]`,
      `type = "stdio"`,
      `command = ${quotedTomlString(entry.command)}`,
      `args = [${argsQuoted}]`,
    ];
    if (entry.env && Object.keys(entry.env).length > 0) {
      const envParts = Object.entries(entry.env)
        .map(([k, v]) => `${k} = ${quotedTomlString(v)}`)
        .join(', ');
      lines.push(`env = { ${envParts} }`);
    }
    return lines.join('\n');
  }

  const lines = [
    `[mcp_servers.${quotedTomlString(name)}]`,
    `url = ${quotedTomlString(entry.serverUrl ?? '')}`,
  ];
  const bearerTokenEnvVar = codexBearerTokenEnvVar(entry);
  if (bearerTokenEnvVar) {
    lines.push(`bearer_token_env_var = ${quotedTomlString(bearerTokenEnvVar)}`);
  }
  if (entry.headers && Object.keys(entry.headers).length) {
    lines.push(`http_headers = { ${Object.entries(entry.headers).map(([name, value]) => `${quotedTomlString(name)} = ${quotedTomlString(value)}`).join(', ')} }`);
  }
  if (entry.envHeaders && Object.keys(entry.envHeaders).length) {
    lines.push(`env_http_headers = { ${Object.entries(entry.envHeaders).map(([name, variable]) => `${quotedTomlString(name)} = ${quotedTomlString(variable)}`).join(', ')} }`);
  }
  return lines.join('\n');
}

// These names are reserved by the Rails MCP builder. A supplied full manifest
// may retire their credentials while unrelated on-volume servers stay intact.
const BUILTIN_CREDENTIAL_SERVERS = [
  'fibe',
  'fibe-gg',
  'fibe-sdk',
  'github',
  'gitea',
];

function mergeMcpServers(
  existing: unknown,
  incoming: Record<string, unknown>,
  fullManifest: boolean,
): Record<string, unknown> {
  const retained = { ...((existing as Record<string, unknown>) ?? {}) };
  if (fullManifest) {
    for (const name of BUILTIN_CREDENTIAL_SERVERS) delete retained[name];
  }
  return { ...retained, ...incoming };
}

const PROVIDER_WRITERS: Record<
  string,
  (servers: Record<string, McpServerEntry>, fullManifest: boolean) => void
> = {
  /**
   * Gemini CLI: ~/.gemini/settings.json
   * Format: { "mcpServers": { "<name>": { "command": ..., "args": [...], "env": {...} } } }
   */
  gemini: (servers, fullManifest) => {
    const dir = getSessionDir() || join(getHome(), '.gemini');
    const configPath = join(dir, 'settings.json');
    let existing: Record<string, unknown> = {};

    try {
      if (existsSync(configPath)) {
        existing = JSON.parse(readFileSync(configPath, 'utf8'));
      }
    } catch {
      // Unreadable config falls back to defaults.
    }

    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const nativeServers: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(servers)) {
      nativeServers[name] = toNativeJsonEntry(entry);
    }

    const config = {
      ...existing,
      mcpServers: mergeMcpServers(
        existing.mcpServers,
        nativeServers,
        fullManifest,
      ),
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    logger.log(`Wrote Gemini MCP config to ${configPath}`);
  },

  antigravity: (servers, fullManifest) => {
    const dir = getSessionDir() || join(getHome(), '.gemini');
    const configDir = join(dir, 'config');
    const configPath = join(configDir, 'mcp_config.json');
    let existing: Record<string, unknown> = {};

    try {
      if (existsSync(configPath)) {
        existing = JSON.parse(readFileSync(configPath, 'utf8'));
      }
    } catch {
      existing = {};
    }

    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

    const nativeServers: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(servers)) {
      nativeServers[name] = toAntigravityJsonEntry(entry);
    }

    const config = {
      ...existing,
      mcpServers: mergeMcpServers(
        existing.mcpServers,
        nativeServers,
        fullManifest,
      ),
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    logger.log(`Wrote Antigravity MCP config to ${configPath}`);
  },

  /** Writes Claude MCP servers to the project and user config files. */
  'claude-code': (servers, fullManifest) => {
    const nativeServers: Record<string, unknown> = {};
    const projectServers: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(servers)) {
      nativeServers[name] = toNativeJsonEntry(entry);
      projectServers[name] = toClaudeProjectJsonEntry(entry);
    }

    const projectPath = getClaudeProjectMcpConfigPath();
    if (projectPath) {
      const projectDir = dirname(projectPath);
      let projectExisting: Record<string, unknown> = {};
      try {
        if (existsSync(projectPath)) {
          projectExisting = JSON.parse(readFileSync(projectPath, 'utf8'));
        }
      } catch {
        // Unreadable config falls back to defaults.
      }

      if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true });

      const projectConfig = {
        ...projectExisting,
        mcpServers: mergeMcpServers(
          projectExisting.mcpServers,
          projectServers,
          fullManifest,
        ),
      };
      writeFileSync(projectPath, JSON.stringify(projectConfig, null, 2));
      logger.log(`Wrote Claude project MCP config to ${projectPath}`);
    } else {
      logger.warn(
        'Skipped Claude project .mcp.json because no conversation id or SESSION_DIR is available',
      );
    }

    const settingsDir = getSessionDir() || join(getHome(), '.claude');
    const settingsPath = join(settingsDir, 'settings.json');
    if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true });

    let settingsExisting: Record<string, unknown> = {};
    try {
      if (existsSync(settingsPath)) {
        settingsExisting = JSON.parse(readFileSync(settingsPath, 'utf8'));
      }
    } catch {
      // Unreadable settings fall back to defaults.
    }

    const settingsConfig = {
      ...settingsExisting,
      ...(june1815Enabled()
        ? { [CLAUDE_SKIP_DANGEROUS_MODE_PROMPT_KEY]: true }
        : {}),
      mcpServers: mergeMcpServers(
        settingsExisting.mcpServers,
        nativeServers,
        fullManifest,
      ),
    };
    writeFileSync(settingsPath, JSON.stringify(settingsConfig, null, 2));
    logger.log(`Wrote Claude MCP config to ${settingsPath}`);
  },

  /**
   * OpenAI Codex: ~/.codex/config.toml
   * Format: [mcp_servers."<name>"] with url/command and env keys (TOML)
   */
  'openai-codex': (servers, fullManifest) => {
    const dir = getSessionDir() || join(getHome(), '.codex');
    const configPath = join(dir, 'config.toml');
    let existingContent = '';

    try {
      if (existsSync(configPath)) {
        existingContent = readFileSync(configPath, 'utf8');
      }
    } catch {
      // Unreadable config falls back to defaults.
    }

    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    for (const [name, entry] of Object.entries(servers)) {
      if (
        entry.serverUrl &&
        entry.authHeader &&
        !codexBearerTokenEnvVar(entry)
      ) {
        logger.warn(
          `Codex MCP server "${name}" uses authHeader, but Codex only supports bearer_token_env_var for remote servers; skipping auth header`,
        );
      }
    }

    const cleaned = stripManagedCodexBlocks(existingContent, [
      ...Object.keys(servers),
      ...(fullManifest ? BUILTIN_CREDENTIAL_SERVERS : []),
    ]);

    const tomlBlocks = Object.entries(servers)
      .map(([name, entry]) => toTomlBlock(name, entry))
      .join('\n\n');

    const finalContent = cleaned
      ? `${cleaned}\n\n${tomlBlocks}\n`
      : `${tomlBlocks}\n`;
    writeFileSync(configPath, finalContent);
    logger.log(`Wrote Codex MCP config (TOML) to ${configPath}`);
  },

  /**
   * OpenCode: injects MCP servers into the OPENCODE_CONFIG_CONTENT env var.
   * OpenCode reads config exclusively from this env var (highest precedence).
   * The strategy's YOLO_ENV already sets base config; we merge MCP servers into it.
   */
  opencode: (servers, fullManifest) => {
    const existingRaw = process.env.OPENCODE_CONFIG_CONTENT;
    let existing: Record<string, unknown> = {};
    try {
      if (existingRaw) existing = JSON.parse(existingRaw);
    } catch {
      // Unreadable config falls back to defaults.
    }

    // Current OpenCode config schema:
    //   - top-level key is "mcp" (NOT "mcpServers")
    //   - local stdio servers: { type: "local", enabled: true, command: string[], environment? }
    //   - remote HTTP servers: { type: "remote", enabled: true, url, headers? }
    const nativeServers: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(servers)) {
      if (entry.command) {
        nativeServers[name] = {
          type: 'local',
          enabled: true,
          command: [entry.command, ...(entry.args ?? [])],
          ...(entry.env ? { environment: entry.env } : {}),
        };
      } else if (entry.serverUrl) {
        const authorization = opencodeAuthorizationHeader(entry);
        const headers = { ...(entry.headers ?? {}) };
        for (const [name, variable] of Object.entries(entry.envHeaders ?? {})) {
          const value = process.env[variable];
          if (value !== undefined) headers[name] = value;
        }
        if (authorization) headers.Authorization = authorization;
        nativeServers[name] = {
          type: 'remote',
          enabled: true,
          url: entry.serverUrl,
          ...(Object.keys(headers).length
            ? { headers }
            : {}),
        };
      }
    }

    const config = {
      ...existing,
      mcp: mergeMcpServers(existing.mcp, nativeServers, fullManifest),
    };
    process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify(config);
    logger.log('Injected MCP servers into OPENCODE_CONFIG_CONTENT env var');
  },

  /**
   * Cursor CLI: project .cursor/mcp.json when a conversation id is available,
   * otherwise SESSION_DIR/ ~/.cursor/mcp.json.
   * Format: { "mcpServers": { "<name>": { "command": ..., "args": [...], "env": {...} } } }
   */
  cursor: (servers, fullManifest) => {
    const configPath = getCursorMcpConfigPath();
    const dir = dirname(configPath);
    let existing: Record<string, unknown> = {};

    try {
      if (existsSync(configPath)) {
        existing = JSON.parse(readFileSync(configPath, 'utf8'));
      }
    } catch {
      // Unreadable config falls back to defaults.
    }

    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const nativeServers: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(servers)) {
      nativeServers[name] = toNativeJsonEntry(entry);
    }

    const config = {
      ...existing,
      mcpServers: mergeMcpServers(
        existing.mcpServers,
        nativeServers,
        fullManifest,
      ),
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    logger.log(`Wrote Cursor MCP config to ${configPath}`);
  },
};

function parseServersFromJson(
  raw: string,
): { servers: Record<string, McpServerEntry>; fullManifest: boolean } | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed?.mcpServers &&
      typeof parsed.mcpServers === 'object' &&
      !Array.isArray(parsed.mcpServers)
    ) {
      return { servers: parsed.mcpServers, fullManifest: true };
    }
    // Legacy single-server format: treat it as the built-in Fibe MCP.
    if (parsed?.serverUrl) {
      return {
        servers: { fibe: parsed as McpServerEntry },
        fullManifest: false,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Writes provider config from MCP_CONFIG_JSON, with extraServers taking priority. */
export function writeMcpConfig(
  extraServers?: Record<string, McpServerEntry>,
): void {
  const rawProvider = process.env.AGENT_PROVIDER || 'claude-code';

  const provider = rawProvider.replace(/_/g, '-');

  const writer = PROVIDER_WRITERS[provider];
  if (!writer) {
    logger.warn(
      `No MCP config writer for provider: ${provider} (raw: ${rawProvider})`,
    );
    return;
  }

  const allServers: Record<string, McpServerEntry> = {};

  let fullManifest = false;
  const mcpRaw = process.env.MCP_CONFIG_JSON;
  if (mcpRaw) {
    const servers = parseServersFromJson(mcpRaw);
    if (servers) {
      Object.assign(allServers, servers.servers);
      fullManifest = servers.fullManifest;
    } else logger.warn('MCP_CONFIG_JSON could not be parsed');
  }

  if (extraServers) {
    Object.assign(allServers, extraServers);
  }
  if (Object.keys(allServers).length === 0 && !fullManifest) {
    logger.log('No MCP servers configured: skipping config write');
    return;
  }

  try {
    writer(allServers, fullManifest);
  } catch (err) {
    logger.error(`Failed to write MCP config: ${err}`);
  }
}
