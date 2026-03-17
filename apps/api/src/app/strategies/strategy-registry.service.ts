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
  'openai-codex',
  'opencode',
  'opencodex',
] as const;

const DEFAULT_PROVIDER = 'claude-code';

@Injectable()
export class StrategyRegistryService {
  resolveStrategy(): AgentStrategy {
    const providerName =
      (process.env.AGENT_PROVIDER as (typeof PROVIDER_NAMES)[number]) ??
      DEFAULT_PROVIDER;

    switch (providerName) {
      case 'mock':
        return new MockStrategy();
      case 'gemini':
        return new GeminiStrategy();
      case 'claude-code':
        return new ClaudeCodeStrategy();
      case 'openai-codex':
        return new OpenaiCodexStrategy();
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
