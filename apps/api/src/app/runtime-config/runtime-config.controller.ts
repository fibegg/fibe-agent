import { Controller, Get } from '@nestjs/common';

export interface RuntimeConfig {
  userAvatarUrl: string | null;
  userAvatarBase64: string | null;
  assistantAvatarUrl: string | null;
  assistantAvatarBase64: string | null;
  agentProvider: string;
  agentProviderLabel: string;
}

function providerLabel(provider: string): string {
  switch (provider.trim().toLowerCase()) {
    case 'claude-code':
    case 'claude':
      return 'Claude';
    case 'openai-codex':
    case 'openai':
    case 'codex':
      return 'Codex';
    case 'gemini':
      return 'Gemini';
    case 'opencode':
    case 'opencodex':
      return 'OpenCode';
    case 'cursor':
      return 'Cursor';
    case 'mock':
      return 'Mock';
    default:
      return provider.trim() || 'Claude';
  }
}

@Controller()
export class RuntimeConfigController {
  @Get('runtime-config')
  getConfig(): RuntimeConfig {
    const agentProvider = process.env.AGENT_PROVIDER?.trim() || 'claude-code';
    return {
      userAvatarUrl: process.env.USER_AVATAR_URL?.trim() || null,
      userAvatarBase64: process.env.USER_AVATAR_BASE64?.trim() || null,
      assistantAvatarUrl: process.env.ASSISTANT_AVATAR_URL?.trim() || null,
      assistantAvatarBase64: process.env.ASSISTANT_AVATAR_BASE64?.trim() || null,
      agentProvider,
      agentProviderLabel: providerLabel(agentProvider),
    };
  }
}
