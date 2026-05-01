export const PROVIDER_AUTH_ERROR_PREFIX = 'Authentication failed for ';

export class ProviderAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderAuthError';
  }
}

const AUTH_FAILURE_REASONS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\b(?:401|unauthorized)\b/i,
    reason: 'the credentials were rejected',
  },
  {
    pattern: /\b(?:403|forbidden)\b/i,
    reason: 'the credentials do not have access',
  },
  {
    pattern: /\b(?:invalid|incorrect|malformed|expired|revoked)[^\n]{0,100}\b(?:api[\s_-]?key|key|token|credential|credentials|auth|oauth)\b/i,
    reason: 'the API key or token is invalid',
  },
  {
    pattern: /\b(?:api[\s_-]?key|key|token|credential|credentials|auth|oauth)[^\n]{0,100}\b(?:invalid|incorrect|malformed|expired|revoked)\b/i,
    reason: 'the API key or token is invalid',
  },
  {
    pattern: /\b(?:invalid_api_key|authentication_error|auth_error|invalid x-api-key)\b/i,
    reason: 'the API key or token is invalid',
  },
  {
    pattern: /\b(?:no|missing)[^\n]{0,80}\b(?:api[\s_-]?key|token|credential|credentials)\b/i,
    reason: 'credentials are missing',
  },
  {
    pattern: /\b(?:not authenticated|authentication required|login required|not logged in|please (?:log in|login|sign in|authenticate))\b/i,
    reason: 'the provider requires authentication',
  },
];

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\)|[PX^_][^\x1b]*(?:\x1b\\)|[()#][0-9A-Za-z]|[=>78])/g;

export function isProviderAuthFailureMessage(message: string | null | undefined): boolean {
  return Boolean(message?.startsWith(PROVIDER_AUTH_ERROR_PREFIX));
}

export function providerAuthFailureMessage(providerLabel: string, reason: string): string {
  return `${PROVIDER_AUTH_ERROR_PREFIX}${providerLabel}: ${reason}. Check the configured ${providerLabel} credentials, then reconnect or re-authenticate.`;
}

export function detectProviderAuthFailure(providerLabel: string, output: string): ProviderAuthError | null {
  const normalized = output.replace(ANSI_RE, '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  const match = AUTH_FAILURE_REASONS.find(({ pattern }) => pattern.test(normalized));
  if (!match) return null;
  return new ProviderAuthError(providerAuthFailureMessage(providerLabel, match.reason));
}
