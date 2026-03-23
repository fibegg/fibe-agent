import { join } from 'node:path';
import { Injectable } from '@nestjs/common';

function sanitizeConversationId(id: string): string {
  const sanitized = id
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return sanitized || 'default';
}

@Injectable()
export class ConfigService {
  getAgentPassword(): string | undefined {
    return process.env.AGENT_PASSWORD;
  }

  getModelOptions(): string[] {
    const raw = process.env.MODEL_OPTIONS ?? '';
    return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
  }

  getDefaultModel(): string {
    const fromEnv = process.env.DEFAULT_MODEL?.trim();
    if (fromEnv) return fromEnv;
    const options = this.getModelOptions();
    return options.length > 0 ? options[0] : '';
  }

  getDataDir(): string {
    return process.env.DATA_DIR ?? join(process.cwd(), 'data');
  }

  getConversationId(): string {
    const raw =
      process.env.PHOENIX_AGENT_ID?.trim() ??
      process.env.CONVERSATION_ID?.trim() ??
      'default';
    return raw || 'default';
  }

  getConversationDataDir(): string {
    return join(this.getDataDir(), sanitizeConversationId(this.getConversationId()));
  }

  getSystemPromptPath(): string {
    if (process.env.SYSTEM_PROMPT_PATH) {
      return process.env.SYSTEM_PROMPT_PATH;
    }
    return join(process.cwd(), 'dist', 'assets', 'SYSTEM_PROMPT.md');
  }

  getSystemPrompt(): string | undefined {
    return process.env.SYSTEM_PROMPT;
  }

  getPlaygroundsDir(): string {
    return process.env.PLAYGROUNDS_DIR ?? join(process.cwd(), 'playground');
  }

  getPhoenixApiKey(): string | undefined {
    return process.env.PHOENIX_API_KEY;
  }

  getPhoenixApiUrl(): string | undefined {
    return process.env.PHOENIX_API_URL;
  }

  getPhoenixAgentId(): string | undefined {
    return process.env.PHOENIX_AGENT_ID;
  }

  isPhoenixSyncEnabled(): boolean {
    return process.env.PHOENIX_SYNC_ENABLED === 'true';
  }

  getPostInitScript(): string | undefined {
    return process.env.POST_INIT_SCRIPT?.trim() || undefined;
  }
}
