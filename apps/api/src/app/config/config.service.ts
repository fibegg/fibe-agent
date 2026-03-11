import { join } from 'node:path';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService {
  getAgentPassword(): string | undefined {
    return process.env.AGENT_PASSWORD;
  }

  getModelOptions(): string[] {
    const raw = process.env.MODEL_OPTIONS ?? '';
    return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
  }

  getDataDir(): string {
    return process.env.DATA_DIR ?? join(process.cwd(), 'data');
  }

  getSystemPromptPath(): string {
    if (process.env.SYSTEM_PROMPT_PATH) {
      return process.env.SYSTEM_PROMPT_PATH;
    }
    return join(process.cwd(), 'dist', 'assets', 'SYSTEM_PROMPT.md');
  }

  getPlaygroundsDir(): string {
    return process.env.PLAYGROUNDS_DIR ?? join(process.cwd(), 'playground');
  }
}
