import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * All settings fibe-agent recognises.
 * Keys are camelCase to keep fibe.yml human-friendly.
 * Every field is optional — unset keys are skipped.
 *
 * MCP config is an object so users can write it inline in YAML
 * instead of escaping a JSON string.
 */
export interface FibeSettings {
  // Agent / auth
  agentPassword?: string;
  agentProvider?: string;
  agentAuthMode?: string;
  /** Array or comma-separated string of model names. */
  modelOptions?: string | string[];
  defaultModel?: string;
  /** Default Claude Code --effort value. Runtime UI changes are stored per conversation. */
  claudeEffort?: string;
  dataDir?: string;
  sessionDir?: string;
  systemPrompt?: string;
  encryptionKey?: string;
  fibeAgentId?: string;
  conversationId?: string;
  marqueeRoot?: string;
  marqueeRootDomain?: string;
  fibeApiKey?: string;
  fibeSyncEnabled?: boolean;
  postInitScript?: string;
  corsOrigins?: string;
  frameAncestors?: string;

  // Cascade settings
  cliVersion?: string;
  providerArgs?: Record<string, unknown>;
  skillToggles?: Record<string, unknown>;
  syscheckEnabled?: boolean;

  // Credentials & runtime files (string OR object form — YAML emits objects, legacy uses strings)
  agentCredentialsJson?: string;
  /** Native object form from YAML (preferred). Serialized to JSON for AGENT_CREDENTIALS_JSON. */
  agentCredentials?: Record<string, unknown>;
  agentRuntimeFilesJson?: string;
  /** Native object form from YAML (preferred). Serialized to JSON for AGENT_RUNTIME_FILES_JSON. */
  agentRuntimeFiles?: Record<string, unknown>;
  /**
   * Pre-computed credential env vars (CLAUDE_CODE_OAUTH_TOKEN, GEMINI_API_KEY, etc.).
   * Rails computes these from the credential data and provider mode.
   * fibe-agent injects them into process.env for native CLI tools.
   */
  credentialEnv?: Record<string, string>;

  // MCP
  /** Equivalent to MCP_CONFIG_JSON (object form from YAML). */
  mcpConfig?: { mcpServers: Record<string, unknown> };
  /** Equivalent to MCP_CONFIG_JSON (string form from Rails). */
  mcpConfigJson?: string;
  askUserTimeoutMs?: number;

  // Gemma Router
  gemmaRouterEnabled?: boolean;
  ollamaUrl?: string;
  gemmaModel?: string;
  gemmaConfidenceThreshold?: number;
  gemmaTimeoutMs?: number;

  // UI / Chat
  userAvatarUrl?: string;
  userAvatarBase64?: string;
  assistantAvatarUrl?: string;
  assistantAvatarBase64?: string;
  /** When true the model selector is disabled. */
  lockChatModel?: boolean;
}

// ─── YAML parser ─────────────────────────────────────────────────────────────

import jsYaml from 'js-yaml';

export function parseYaml(content: string): Record<string, unknown> {
  try {
    const result = jsYaml.load(content);
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return result as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

// ─── Readers ─────────────────────────────────────────────────────────────────

function yamlCandidates(): string[] {
  const override = process.env.FIBE_SETTINGS_YAML_PATHS;
  if (override) {
    return override.split(',').map((path) => path.trim()).filter(Boolean);
  }
  return ['/app/fibe.yml', join(process.cwd(), 'fibe.yml')];
}

function readYaml(): Record<string, unknown> {
  for (const path of yamlCandidates()) {
    if (!existsSync(path)) continue;
    try {
      return parseYaml(readFileSync(path, 'utf8'));
    } catch (err) {
      console.warn(`[fibe-settings] Cannot parse ${path}: ${err}`);
    }
  }
  return {};
}

function readJson(): Record<string, unknown> {
  const raw = process.env.FIBE_SETTINGS_JSON;
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    console.warn('[fibe-settings] FIBE_SETTINGS_JSON must be a JSON object — ignored');
  } catch (err) {
    console.warn(`[fibe-settings] Cannot parse FIBE_SETTINGS_JSON: ${err}`);
  }
  return {};
}

// ─── Env promotion ────────────────────────────────────────────────────────────

/**
 * Promotes merged settings into process.env.
 * Existing env vars are NEVER overwritten (individual vars always win).
 */
function promoteToEnv(s: FibeSettings): void {
  // Only set if the env var is not already present
  const set = (key: string, value: string | undefined): void => {
    if (value !== undefined && !process.env[key]) process.env[key] = value;
  };
  const bool = (v: boolean) => (v ? 'true' : 'false');

  // Agent
  set('AGENT_PASSWORD', s.agentPassword);
  set('AGENT_PROVIDER', s.agentProvider);
  set('AGENT_AUTH_MODE', s.agentAuthMode);
  if (s.modelOptions !== undefined)
    set('MODEL_OPTIONS', Array.isArray(s.modelOptions) ? s.modelOptions.join(',') : s.modelOptions);
  set('DEFAULT_MODEL', s.defaultModel);
  set('CLAUDE_EFFORT', s.claudeEffort);
  set('DATA_DIR', s.dataDir);
  set('SESSION_DIR', s.sessionDir);
  set('SYSTEM_PROMPT', s.systemPrompt);
  set('ENCRYPTION_KEY', s.encryptionKey);
  set('FIBE_AGENT_ID', s.fibeAgentId);
  set('CONVERSATION_ID', s.conversationId);
  set('MARQUEE_ROOT', s.marqueeRoot);
  set('MARQUEE_ROOT_DOMAIN', s.marqueeRootDomain);
  set('FIBE_API_KEY', s.fibeApiKey);
  if (s.fibeSyncEnabled !== undefined) set('FIBE_SYNC_ENABLED', bool(s.fibeSyncEnabled));
  set('POST_INIT_SCRIPT', s.postInitScript);
  set('CORS_ORIGINS', s.corsOrigins);
  set('FRAME_ANCESTORS', s.frameAncestors);

  // Cascade settings
  set('FIBE_CLI_VERSION', s.cliVersion);
  if (s.providerArgs !== undefined) set('PROVIDER_ARGS', JSON.stringify(s.providerArgs));
  if (s.skillToggles !== undefined) set('SKILL_TOGGLES', JSON.stringify(s.skillToggles));
  if (s.syscheckEnabled !== undefined) set('SYSCHECK_ENABLED', bool(s.syscheckEnabled));

  // Credentials & runtime files — accept both string (legacy) and object (YAML-native) forms
  if (s.agentCredentialsJson !== undefined) set('AGENT_CREDENTIALS_JSON', s.agentCredentialsJson);
  else if (s.agentCredentials !== undefined) set('AGENT_CREDENTIALS_JSON', JSON.stringify(s.agentCredentials));
  if (s.agentRuntimeFilesJson !== undefined) set('AGENT_RUNTIME_FILES_JSON', s.agentRuntimeFilesJson);
  else if (s.agentRuntimeFiles !== undefined) set('AGENT_RUNTIME_FILES_JSON', JSON.stringify(s.agentRuntimeFiles));

  // Credential env — pre-computed by Rails, injected for native CLI tools
  if (s.credentialEnv) {
    for (const [k, v] of Object.entries(s.credentialEnv)) {
      set(k, v);
    }
  }

  // MCP — accept both object (mcpConfig) and string (mcpConfigJson) forms
  if (s.mcpConfigJson !== undefined) set('MCP_CONFIG_JSON', s.mcpConfigJson);
  else if (s.mcpConfig !== undefined) set('MCP_CONFIG_JSON', JSON.stringify(s.mcpConfig));
  if (s.askUserTimeoutMs !== undefined) set('ASK_USER_TIMEOUT_MS', String(s.askUserTimeoutMs));

  // Gemma Router
  if (s.gemmaRouterEnabled !== undefined) set('GEMMA_ROUTER_ENABLED', bool(s.gemmaRouterEnabled));
  set('OLLAMA_URL', s.ollamaUrl);
  set('GEMMA_MODEL', s.gemmaModel);
  if (s.gemmaConfidenceThreshold !== undefined) set('GEMMA_CONFIDENCE_THRESHOLD', String(s.gemmaConfidenceThreshold));
  if (s.gemmaTimeoutMs !== undefined) set('GEMMA_TIMEOUT_MS', String(s.gemmaTimeoutMs));

  // UI / Chat
  set('USER_AVATAR_URL', s.userAvatarUrl);
  set('USER_AVATAR_BASE64', s.userAvatarBase64);
  set('ASSISTANT_AVATAR_URL', s.assistantAvatarUrl);
  set('ASSISTANT_AVATAR_BASE64', s.assistantAvatarBase64);
  if (s.lockChatModel !== undefined) set('LOCK_CHAT_MODEL', bool(s.lockChatModel));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load and return the merged settings without mutating process.env.
 * Useful for testing and introspection.
 */
export function loadFibeSettings(): FibeSettings {
  return { ...readYaml(), ...readJson() } as FibeSettings;
}

/**
 * Load, merge, and promote fibe settings into process.env.
 *
 * Call once at startup **before** any service reads process.env.
 * Safe to call multiple times — setIfAbsent ensures idempotency.
 *
 * Priority (highest → lowest):
 *   1. Individual env vars (always win)
 *   2. FIBE_SETTINGS_JSON
 *   3. /app/fibe.yml  (or ./fibe.yml in dev)
 */
export function applyFibeSettings(): void {
  promoteToEnv(loadFibeSettings());
}
