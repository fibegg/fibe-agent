export interface CapturedProviderRequest {
  id: string;
  timestamp: string;
  provider: ProviderName;

  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string | null;
    bodyTruncated: boolean;
  };

  response: {
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string>;
    body: string | null;
    bodyTruncated: boolean;
  };

  durationMs: number;
  bytesReceived: number;
  bytesSent: number;
  isStreaming: boolean;
  error: string | null;

  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  };
}

export type ProviderName = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'unknown';

export const PROVIDER_DOMAIN_MAP: Record<string, ProviderName> = {
  'api.anthropic.com': 'anthropic',
  'api.openai.com': 'openai',
  'generativelanguage.googleapis.com': 'google',
  'openrouter.ai': 'openrouter',
};

/** Domains we intercept TLS for. Others get passthrough tunneling. */
export const INTERCEPTED_DOMAINS = new Set(Object.keys(PROVIDER_DOMAIN_MAP));

/** Headers whose values must be redacted in captured records. */
export const REDACTED_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'api-key',
  'x-goog-api-key',
]);

export const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

export function resolveProvider(hostname: string): ProviderName {
  return PROVIDER_DOMAIN_MAP[hostname] ?? 'unknown';
}

/**
 * Returns env vars that route a spawned CLI through the MITM proxy.
 * Returns an empty object when the proxy is not active.
 */
export function getProxyEnv(): Record<string, string> {
  const port = process.env['__FIBE_PROXY_PORT'];
  const caPath = process.env['__FIBE_PROXY_CA_PATH'];
  if (!port) return {};
  const env: Record<string, string> = {
    HTTPS_PROXY: `http://127.0.0.1:${port}`,
    HTTP_PROXY: `http://127.0.0.1:${port}`,
  };
  if (caPath) {
    env['NODE_EXTRA_CA_CERTS'] = caPath;
  }
  return env;
}

export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    sanitized[key] = REDACTED_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value;
  }
  return sanitized;
}
