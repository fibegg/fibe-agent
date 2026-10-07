import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Optional camelCase settings accepted from fibe.yml. */
export interface FibeSettings {
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
  hostRoot?: string;
  hostRootDomain?: string;
  fibeApiKey?: string;
  fibeSyncEnabled?: boolean;
  postInitScript?: string;
  corsOrigins?: string;
  frameAncestors?: string;

  cliVersion?: string;
  providerArgs?: Record<string, unknown>;
  skillToggles?: Record<string, unknown>;
  syscheckEnabled?: boolean;

  agentCredentialsJson?: string;
  /** Native object form from YAML (preferred). Serialized to JSON for AGENT_CREDENTIALS_JSON. */
  agentCredentials?: Record<string, unknown>;
  agentRuntimeFilesJson?: string;
  /** Native object form from YAML (preferred). Serialized to JSON for AGENT_RUNTIME_FILES_JSON. */
  agentRuntimeFiles?: Record<string, unknown>;
  /** Credential variables precomputed by Rails for native provider CLIs. */
  credentialEnv?: Record<string, string>;
  opencodeConfig?: Record<string, unknown>;
  opencodeConfigJson?: string;

  /** Equivalent to MCP_CONFIG_JSON (object form from YAML). */
  mcpConfig?: { mcpServers: Record<string, unknown> };
  /** Equivalent to MCP_CONFIG_JSON (string form from Rails). */
  mcpConfigJson?: string;
  askUserTimeoutMs?: number;

  gemmaRouterEnabled?: boolean;
  ollamaUrl?: string;
  gemmaModel?: string;
  gemmaConfidenceThreshold?: number;
  gemmaTimeoutMs?: number;

  /** Maximum simultaneous chat websocket connections before the oldest is evicted. */
  websocketMaxConnections?: number | string;
  /** Maximum source image size, in bytes, converted to PNG before OCR. */
  ocrConversionMaxBytes?: number | string;
  /** Maximum converted PNG size, in bytes, accepted before OCR. */
  ocrConversionMaxOutputBytes?: number | string;
  userAvatarUrl?: string;
  userAvatarBase64?: string;
  assistantAvatarUrl?: string;
  assistantAvatarBase64?: string;
  /** When true the model selector is disabled. */
  lockChatModel?: boolean;
  /** Controls the Simplicate switch. When true, the chat header uses the compact layout. */
  simplicate?: boolean;
}

import jsYaml from 'js-yaml';

const REMOVED_FIBE_SETTINGS = {
  marqueeRoot: 'hostRoot',
  marqueeRootDomain: 'hostRootDomain',
} as const;
const REMOVED_FIBE_ENV = {
  MARQUEE_ROOT: 'HOST_ROOT',
  MARQUEE_ROOT_DOMAIN: 'HOST_ROOT_DOMAIN',
  FIBE_MARQUEE_ID: 'FIBE_HOST_ID',
  FIBE_PLAYSPEC_ID: 'FIBE_SPEC_ID',
  FIBE_PROP_ID: 'FIBE_REPOSITORY_ID',
} as const;
class RemovedFibeKeyError extends Error {}

function rejectRemovedKeys(settings: Record<string, unknown>, source: string): void {
  for (const [removed, replacement] of Object.entries(REMOVED_FIBE_SETTINGS)) {
    if (Object.hasOwn(settings, removed)) {
      throw new RemovedFibeKeyError(`${source}: ${removed} was removed; use ${replacement}`);
    }
  }
}

export function parseYaml(content: string): Record<string, unknown> {
  let result: unknown;
  try {
    result = jsYaml.load(content);
  } catch {
    return {};
  }
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    rejectRemovedKeys(result as Record<string, unknown>, 'fibe.yml');
    return result as Record<string, unknown>;
  }
  return {};
}

function yamlCandidates(): string[] {
  const localPath = join(process.cwd(), 'fibe.yml');
  return localPath === '/app/fibe.yml'
    ? [localPath]
    : [localPath, '/app/fibe.yml'];
}

function readYaml(): Record<string, unknown> {
  for (const path of yamlCandidates()) {
    if (!existsSync(path)) continue;
    try {
      return parseYaml(readFileSync(path, 'utf8'));
    } catch (err) {
      if (err instanceof RemovedFibeKeyError) throw err;
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
    if (v && typeof v === 'object' && !Array.isArray(v))
      return v as Record<string, unknown>;
    console.warn(
      '[fibe-settings] FIBE_SETTINGS_JSON must be a JSON object: ignored',
    );
  } catch (err) {
    console.warn(`[fibe-settings] Cannot parse FIBE_SETTINGS_JSON: ${err}`);
  }
  return {};
}

/** Promotes settings into unset environment variables. */
function promoteToEnv(s: FibeSettings): string[] {
  const promotedCredentialEnvKeys: string[] = [];
  const set = (key: string, value: string | null | undefined): boolean => {
    if (value !== undefined && value !== null && !process.env[key]) {
      process.env[key] = value;
      return true;
    }
    return false;
  };
  const bool = (v: boolean) => (v ? 'true' : 'false');

  set('AGENT_PASSWORD', s.agentPassword);
  set('AGENT_PROVIDER', s.agentProvider);
  set('AGENT_AUTH_MODE', s.agentAuthMode);
  if (s.modelOptions !== undefined)
    set(
      'MODEL_OPTIONS',
      Array.isArray(s.modelOptions) ? s.modelOptions.join(',') : s.modelOptions,
    );
  set('DEFAULT_MODEL', s.defaultModel);
  set('CLAUDE_EFFORT', s.claudeEffort);
  set('DATA_DIR', s.dataDir);
  set('SESSION_DIR', s.sessionDir);
  set('SYSTEM_PROMPT', s.systemPrompt);
  set('ENCRYPTION_KEY', s.encryptionKey);
  set('FIBE_AGENT_ID', s.fibeAgentId);
  set('CONVERSATION_ID', s.conversationId);
  set('HOST_ROOT', s.hostRoot);
  set('HOST_ROOT_DOMAIN', s.hostRootDomain);
  set('FIBE_API_KEY', s.fibeApiKey);
  if (s.fibeSyncEnabled !== undefined)
    set('FIBE_SYNC_ENABLED', bool(s.fibeSyncEnabled));
  set('POST_INIT_SCRIPT', s.postInitScript);
  set('CORS_ORIGINS', s.corsOrigins);
  set('FRAME_ANCESTORS', s.frameAncestors);

  set('FIBE_CLI_VERSION', s.cliVersion);
  if (s.providerArgs !== undefined)
    set('PROVIDER_ARGS', JSON.stringify(s.providerArgs));
  if (s.skillToggles !== undefined)
    set('SKILL_TOGGLES', JSON.stringify(s.skillToggles));
  if (s.syscheckEnabled !== undefined)
    set('SYSCHECK_ENABLED', bool(s.syscheckEnabled));

  if (s.agentCredentialsJson !== undefined)
    set('AGENT_CREDENTIALS_JSON', s.agentCredentialsJson);
  else if (s.agentCredentials !== undefined)
    set('AGENT_CREDENTIALS_JSON', JSON.stringify(s.agentCredentials));
  if (s.agentRuntimeFilesJson !== undefined)
    set('AGENT_RUNTIME_FILES_JSON', s.agentRuntimeFilesJson);
  else if (s.agentRuntimeFiles !== undefined)
    set('AGENT_RUNTIME_FILES_JSON', JSON.stringify(s.agentRuntimeFiles));

  if (s.credentialEnv) {
    for (const [k, v] of Object.entries(s.credentialEnv)) {
      if (set(k, v)) promotedCredentialEnvKeys.push(k);
    }
  }

  if (s.opencodeConfigJson !== undefined)
    mergeJsonEnv('OPENCODE_CONFIG_CONTENT', s.opencodeConfigJson);
  else if (s.opencodeConfig !== undefined)
    mergeJsonEnv('OPENCODE_CONFIG_CONTENT', s.opencodeConfig);

  if (s.mcpConfigJson !== undefined) set('MCP_CONFIG_JSON', s.mcpConfigJson);
  else if (s.mcpConfig !== undefined)
    set('MCP_CONFIG_JSON', JSON.stringify(s.mcpConfig));
  if (s.askUserTimeoutMs !== undefined)
    set('ASK_USER_TIMEOUT_MS', String(s.askUserTimeoutMs));

  if (s.gemmaRouterEnabled !== undefined)
    set('GEMMA_ROUTER_ENABLED', bool(s.gemmaRouterEnabled));
  set('OLLAMA_URL', s.ollamaUrl);
  set('GEMMA_MODEL', s.gemmaModel);
  if (s.gemmaConfidenceThreshold !== undefined)
    set('GEMMA_CONFIDENCE_THRESHOLD', String(s.gemmaConfidenceThreshold));
  if (s.gemmaTimeoutMs !== undefined)
    set('GEMMA_TIMEOUT_MS', String(s.gemmaTimeoutMs));

  if (s.websocketMaxConnections !== undefined)
    set('WEBSOCKET_MAX_CONNECTIONS', String(s.websocketMaxConnections));
  if (s.ocrConversionMaxBytes !== undefined)
    set('FIBE_OCR_CONVERSION_MAX_BYTES', String(s.ocrConversionMaxBytes));
  if (s.ocrConversionMaxOutputBytes !== undefined)
    set(
      'FIBE_OCR_CONVERSION_MAX_OUTPUT_BYTES',
      String(s.ocrConversionMaxOutputBytes),
    );
  set('USER_AVATAR_URL', s.userAvatarUrl);
  set('USER_AVATAR_BASE64', s.userAvatarBase64);
  set('ASSISTANT_AVATAR_URL', s.assistantAvatarUrl);
  set('ASSISTANT_AVATAR_BASE64', s.assistantAvatarBase64);
  if (s.lockChatModel !== undefined)
    set('LOCK_CHAT_MODEL', bool(s.lockChatModel));
  if (s.simplicate !== undefined) set('SIMPLICATE', bool(s.simplicate));

  return promotedCredentialEnvKeys.sort();
}

function jsonRecord(
  value: string | Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== 'string') return value;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mergeRecords(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = merged[key];
    const baseRecord =
      baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue)
        ? (baseValue as Record<string, unknown>)
        : null;
    const patchRecord =
      patchValue && typeof patchValue === 'object' && !Array.isArray(patchValue)
        ? (patchValue as Record<string, unknown>)
        : null;
    merged[key] =
      baseRecord && patchRecord
        ? mergeRecords(baseRecord, patchRecord)
        : patchValue;
  }
  return merged;
}

function mergeJsonEnv(
  key: string,
  value: string | Record<string, unknown>,
): void {
  const existing = jsonRecord(process.env[key]);
  const incoming = jsonRecord(value);
  process.env[key] = JSON.stringify(mergeRecords(incoming, existing));
}

/** Loads merged settings without changing process.env. */
export function loadFibeSettings(): FibeSettings {
  for (const [removed, replacement] of Object.entries(REMOVED_FIBE_ENV)) {
    if (Object.hasOwn(process.env, removed)) {
      throw new Error(`${removed} was removed; use ${replacement}`);
    }
  }
  const yaml = readYaml();
  const json = readJson();
  // Validate both sources independently: an override cannot conceal an obsolete key.
  rejectRemovedKeys(yaml, 'fibe.yml');
  rejectRemovedKeys(json, 'FIBE_SETTINGS_JSON');
  for (const settings of [yaml, json]) {
    if (settings.credentialEnv && typeof settings.credentialEnv === 'object') {
      for (const [removed, replacement] of Object.entries(REMOVED_FIBE_ENV)) {
        if (Object.hasOwn(settings.credentialEnv, removed)) {
          throw new RemovedFibeKeyError(`credentialEnv: ${removed} was removed; use ${replacement}`);
        }
      }
    }
  }
  return { ...yaml, ...json } as FibeSettings;
}

/**
 * Promotes merged settings before services start. Existing variables override
 * FIBE_SETTINGS_JSON, which overrides fibe.yml. Repeated calls are safe.
 */
export function applyFibeSettings(): void {
  const promotedCredentialEnvKeys = promoteToEnv(loadFibeSettings());
  if (promotedCredentialEnvKeys.length > 0) {
    console.info(
      `[fibe-settings] Promoted credential env keys: ${promotedCredentialEnvKeys.join(', ')}`,
    );
  }
}
