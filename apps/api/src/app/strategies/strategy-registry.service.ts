import { Injectable } from '@nestjs/common';
import { ClaudeCodeStrategy } from './claude-code.strategy';
import { GeminiStrategy } from './gemini.strategy';
import { MockStrategy } from './mock.strategy';
import { OpencodeStrategy } from './opencode.strategy';
import { OpenaiCodexStrategy } from './openai-codex.strategy';
import type { AgentStrategy } from './strategy.types';

const PROVIDER_NAMES = [
  'mock',
  'gemini',
  'claude-code',
  'openai',
  'openai-codex',
  'opencode',
  'opencodex',
] as const;

const AUTH_MODE_NAMES = ['oauth', 'api-token'] as const;

type ProviderName = (typeof PROVIDER_NAMES)[number];
type AuthMode = (typeof AUTH_MODE_NAMES)[number];

export const DEFAULT_PROVIDER: ProviderName = 'claude-code';
const DEFAULT_AUTH_MODE: AuthMode = 'oauth';

function resolveAuthMode(): AuthMode {
  const raw = (process.env.AGENT_AUTH_MODE ?? '').toLowerCase();
  if (!raw) return DEFAULT_AUTH_MODE;
  const candidate = raw as AuthMode;
  return (AUTH_MODE_NAMES as readonly string[]).includes(candidate) ? candidate : DEFAULT_AUTH_MODE;
}

@Injectable()
export class StrategyRegistryService {
  resolveStrategy(): AgentStrategy {
    const providerName =
      (process.env.AGENT_PROVIDER as ProviderName | undefined) ?? DEFAULT_PROVIDER;
    const authMode = resolveAuthMode();
    const useApiToken = authMode === 'api-token';

    switch (providerName) {
      case 'mock':
        return new MockStrategy();
      case 'gemini':
        return new GeminiStrategy(useApiToken);
      case 'claude-code':
        return new ClaudeCodeStrategy(useApiToken);
      case 'openai':
      case 'openai-codex':
        return new OpenaiCodexStrategy(useApiToken);
      case 'opencode':
      case 'opencodex':
        return new OpencodeStrategy();
      default:
        throw new Error(
          `Unknown AGENT_PROVIDER: '${providerName}'. Available: ${PROVIDER_NAMES.join(', ')}`
        );
    }
  }
}
