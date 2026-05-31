export const PROVIDER_AUTH_ERROR_PREFIX = 'Authentication failed for ';

export class ProviderAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderAuthError';
  }
}

export type ProviderFailureKind =
  | 'auth'
  | 'missing_credentials'
  | 'rate_limit'
  | 'quota'
  | 'model_not_found'
  | 'missing_session'
  | 'provider_error';

export interface ProviderFailure {
  kind: ProviderFailureKind;
  reason: string;
  statusCode?: number;
  providerStatus?: string;
}

const AUTH_FAILURE_REASONS: Array<{ pattern: RegExp; reason: string; kind?: ProviderFailureKind }> = [
  {
    pattern: /\b(?:401|unauthorized)\b/i,
    reason: 'the credentials were rejected',
    kind: 'auth',
  },
  {
    pattern: /\b(?:403|forbidden)\b/i,
    reason: 'the credentials do not have access',
    kind: 'auth',
  },
  {
    pattern: /\b(?:invalid|incorrect|malformed|expired|revoked)[^\n]{0,100}\b(?:api[\s_-]?key|key|token|credential|credentials|auth|oauth)\b/i,
    reason: 'the API key or token is invalid',
    kind: 'auth',
  },
  {
    pattern: /\b(?:api[\s_-]?key|key|token|credential|credentials|auth|oauth)[^\n]{0,100}\b(?:invalid|incorrect|malformed|expired|revoked)\b/i,
    reason: 'the API key or token is invalid',
    kind: 'auth',
  },
  {
    pattern: /\b(?:invalid_api_key|authentication_error|auth_error|invalid x-api-key)\b/i,
    reason: 'the API key or token is invalid',
    kind: 'auth',
  },
  {
    pattern: /\b(?:no|missing)[^\n]{0,80}\b(?:api[\s_-]?key|token|credential|credentials)\b/i,
    reason: 'credentials are missing',
    kind: 'missing_credentials',
  },
  {
    pattern: /\b(?:api[\s_-]?key|token|credential|credentials)[^\n]{0,80}\b(?:is|are)?\s*missing\b/i,
    reason: 'credentials are missing',
    kind: 'missing_credentials',
  },
  {
    pattern: /\b(?:not authenticated|authentication required|login required|not logged in|please (?:log in|login|sign in|authenticate))\b/i,
    reason: 'the provider requires authentication',
    kind: 'auth',
  },
];

const PROVIDER_ERROR_PATTERNS = [
  /\bAI_APICallError\b/i,
  /\bstream error\b/i,
  /\bprovider request failed\b/i,
  /\bprovider error\b/i,
];

const MISSING_SESSION_PATTERNS = [
  /No conversation found with session ID:/i,
  /\b(conversation|session)\b[^\n]*\b(not found|missing)\b/i,
  /\b(failed|unable)\b[^\n]*\b(resume|continue)\b/i,
];

const QUOTA_PATTERNS = [
  /\b(?:RESOURCE_EXHAUSTED|MODEL_CAPACITY_EXHAUSTED|TerminalQuotaError)\b/i,
  /\bquota (?:exceeded|will reset)\b/i,
  /\bexhausted your (?:daily quota|capacity)\b/i,
  /\bquota\/rate limit exhausted\b/i,
  /\bgenerate_content_free_tier_requests\b/i,
];

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)|[PX^_][^\x1b]*(?:\x1b\\)|[()#][0-9A-Za-z]|[=>78])/g;

export function isProviderAuthFailureMessage(message: string | null | undefined): boolean {
  return Boolean(message?.startsWith(PROVIDER_AUTH_ERROR_PREFIX));
}

export function providerAuthFailureMessage(providerLabel: string, reason: string): string {
  return `${PROVIDER_AUTH_ERROR_PREFIX}${providerLabel}: ${reason}. Check the configured ${providerLabel} credentials, then reconnect or re-authenticate.`;
}

function normalizeProviderOutput(output: string): string {
  return output.replace(ANSI_RE, '').replace(/\s+/g, ' ').trim();
}

function extractErrorJson(output: string): unknown | null {
  const marker = 'error=';
  const markerIndex = output.indexOf(marker);
  const start = output.indexOf('{', markerIndex >= 0 ? markerIndex + marker.length : 0);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < output.length; index += 1) {
    const char = output[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      try {
        return JSON.parse(output.slice(start, index + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function findField(value: unknown, names: string[]): unknown {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findField(item, names);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const name of names) {
    if (record[name] !== undefined) return record[name];
  }
  for (const child of Object.values(record)) {
    const found = findField(child, names);
    if (found !== undefined) return found;
  }
  return undefined;
}

function collectPrimitiveText(value: unknown, parts: string[] = []): string[] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    parts.push(String(value));
    return parts;
  }
  if (!value || typeof value !== 'object') return parts;
  if (Array.isArray(value)) {
    for (const item of value) collectPrimitiveText(item, parts);
    return parts;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    collectPrimitiveText(child, parts);
  }
  return parts;
}

function statusCodeFrom(value: unknown, normalized: string): number | undefined {
  const structuredStatus = findField(value, ['statusCode', 'status']);
  if (typeof structuredStatus === 'number' && Number.isFinite(structuredStatus)) return structuredStatus;
  if (typeof structuredStatus === 'string' && /^\d{3}$/.test(structuredStatus)) {
    return Number.parseInt(structuredStatus, 10);
  }

  const match = normalized.match(/\b(?:statusCode|status|HTTP|code)\b[^0-9]{0,20}(\d{3})\b/i);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function providerStatusFrom(value: unknown, normalized: string): string | undefined {
  const structuredStatus = findField(value, ['status']);
  if (typeof structuredStatus === 'string' && !/^\d{3}$/.test(structuredStatus)) return structuredStatus;
  return normalized.match(/\b(?:status|code)"?\s*[:=]\s*"?([A-Z_]{3,})"?/i)?.[1];
}

function reasonFor(statusCode: number | undefined, providerStatus: string | undefined, fallback: string): string {
  return providerStatus ?? (statusCode ? `HTTP ${statusCode}` : fallback);
}

export function detectProviderFailure(output: string): ProviderFailure | null {
  const structured = extractErrorJson(output);
  const structuredText = structured ? collectPrimitiveText(structured).join(' ') : '';
  const normalized = normalizeProviderOutput(`${structuredText} ${output}`);
  if (!normalized) return null;

  const statusCode = statusCodeFrom(structured, normalized);
  const providerStatus = providerStatusFrom(structured, normalized);
  const baseReason = reasonFor(statusCode, providerStatus, 'provider request failed');

  if (QUOTA_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { kind: 'quota', reason: baseReason, statusCode, providerStatus };
  }

  if (statusCode === 429 || /\brate limit(?:ed)?\b/i.test(normalized)) {
    return { kind: 'rate_limit', reason: baseReason, statusCode, providerStatus };
  }

  const authMatch = AUTH_FAILURE_REASONS.find(({ pattern }) => pattern.test(normalized));
  if (authMatch) {
    return {
      kind: authMatch.kind ?? 'auth',
      reason: authMatch.reason,
      statusCode,
      providerStatus,
    };
  }

  if (MISSING_SESSION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { kind: 'missing_session', reason: 'session is missing', statusCode, providerStatus };
  }

  if (/\b(?:ModelNotFoundError|model_not_found|requested entity was not found)\b/i.test(normalized)
    || /\bmodel\b[^\n]{0,100}\bnot found\b/i.test(normalized)) {
    return { kind: 'model_not_found', reason: 'model was not found', statusCode, providerStatus };
  }

  if (PROVIDER_ERROR_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { kind: 'provider_error', reason: baseReason, statusCode, providerStatus };
  }

  return null;
}

export function detectProviderAuthFailure(providerLabel: string, output: string): ProviderAuthError | null {
  const failure = detectProviderFailure(output);
  if (!failure || (failure.kind !== 'auth' && failure.kind !== 'missing_credentials')) return null;
  return new ProviderAuthError(providerAuthFailureMessage(providerLabel, failure.reason));
}
