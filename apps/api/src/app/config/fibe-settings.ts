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
  /** Array or comma-separated string of model names. */
  modelOptions?: string | string[];
  defaultModel?: string;
  dataDir?: string;
  systemPromptPath?: string;
  systemPrompt?: string;
  encryptionKey?: string;
  fibeAgentId?: string;
  conversationId?: string;
  playroomsRoot?: string;
  fibeApiUrl?: string;
  fibeApiKey?: string;
  fibeSyncEnabled?: boolean;
  postInitScript?: string;
  corsOrigins?: string;
  frameAncestors?: string;

  // MCP
  /** Equivalent to MCP_CONFIG_JSON. */
  mcpConfig?: { mcpServers: Record<string, unknown> };
  /** Equivalent to DOCKER_MCP_CONFIG_JSON. */
  dockerMcpConfig?: { mcpServers: Record<string, unknown> };
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

// ─── Minimal YAML parser ──────────────────────────────────────────────────────
//
// Intentionally avoids third-party dependencies.
// Handles the flat / one-level-nested subset used in fibe.yml:
//   key: scalar          → string / number / boolean / null
//   key:                 → nested object { k: v, ... }
//     nested: scalar
//   key:                 → scalar array
//     - item
// Comments (#) and blank lines are ignored.
// Unknown / complex structures are silently skipped — never crash.

type YamlValue = string | number | boolean | null | Record<string, unknown> | unknown[];

function parseScalar(raw: string): YamlValue {
  const v = raw.trim();
  if (v === '' || v === 'null' || v === '~') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'")) {
    return v.slice(1, -1);
  }
  return v;
}

const TOP_KEY_RE = /^([a-zA-Z_]\w*):\s*(.*)/;
const NESTED_KEY_RE = /^([a-zA-Z_]\w*):\s*(.*)/;
const ARRAY_ITEM_RE = /^-\s+(.*)/;

export function parseYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const stripped = lines[i].replace(/#.*$/, '').trimEnd();
    if (!stripped.trim()) { i++; continue; }

    const top = stripped.match(TOP_KEY_RE);
    if (!top) { i++; continue; }

    const [, key, afterColon] = top;
    const valueStr = afterColon.replace(/#.*$/, '').trim();

    if (valueStr) {
      result[key] = parseScalar(valueStr);
      i++;
      continue;
    }

    // Block: peek ahead for indented children
    i++;
    const children: Record<string, unknown> = {};
    const items: unknown[] = [];
    let isArray = false;

    while (i < lines.length) {
      const childRaw = lines[i];
      const childStripped = childRaw.replace(/#.*$/, '').trimEnd();
      if (!childStripped.trim()) { i++; continue; }
      if (childRaw.search(/\S/) <= 0) break;

      const trimmed = childStripped.trim();
      const arrayMatch = trimmed.match(ARRAY_ITEM_RE);
      if (arrayMatch) {
        isArray = true;
        items.push(parseScalar(arrayMatch[1]));
        i++;
        continue;
      }

      const nested = trimmed.match(NESTED_KEY_RE);
      if (nested) {
        const [, nKey, nVal] = nested;
        children[nKey] = nVal.replace(/#.*$/, '').trim() || null;
        // parse scalar if non-empty
        if (children[nKey]) children[nKey] = parseScalar(children[nKey] as string);
        i++;
        continue;
      }
      i++;
    }

    result[key] = isArray ? items : Object.keys(children).length ? children : null;
  }

  return result;
}

// ─── Readers ─────────────────────────────────────────────────────────────────

const YAML_CANDIDATES = ['/app/fibe.yml', join(process.cwd(), 'fibe.yml')];

function readYaml(): Record<string, unknown> {
  for (const path of YAML_CANDIDATES) {
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
  if (s.modelOptions !== undefined)
    set('MODEL_OPTIONS', Array.isArray(s.modelOptions) ? s.modelOptions.join(',') : s.modelOptions);
  set('DEFAULT_MODEL', s.defaultModel);
  set('DATA_DIR', s.dataDir);
  set('SYSTEM_PROMPT_PATH', s.systemPromptPath);
  set('SYSTEM_PROMPT', s.systemPrompt);
  set('ENCRYPTION_KEY', s.encryptionKey);
  set('FIBE_AGENT_ID', s.fibeAgentId);
  set('CONVERSATION_ID', s.conversationId);
  set('PLAYROOMS_ROOT', s.playroomsRoot);
  set('FIBE_API_URL', s.fibeApiUrl);
  set('FIBE_API_KEY', s.fibeApiKey);
  if (s.fibeSyncEnabled !== undefined) set('FIBE_SYNC_ENABLED', bool(s.fibeSyncEnabled));
  set('POST_INIT_SCRIPT', s.postInitScript);
  set('CORS_ORIGINS', s.corsOrigins);
  set('FRAME_ANCESTORS', s.frameAncestors);

  // MCP
  if (s.mcpConfig !== undefined) set('MCP_CONFIG_JSON', JSON.stringify(s.mcpConfig));
  if (s.dockerMcpConfig !== undefined) set('DOCKER_MCP_CONFIG_JSON', JSON.stringify(s.dockerMcpConfig));
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
