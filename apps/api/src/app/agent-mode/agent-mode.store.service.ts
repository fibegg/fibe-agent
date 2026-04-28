import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';
import { SequentialJsonWriter } from '../persistence/sequential-json-writer';
import { decryptData } from '../crypto/crypto.util';
import {
  DEFAULT_AGENT_MODE,
  resolveAgentMode,
  type AgentModeValue,
} from '@shared/agent-mode.constants';

@Injectable()
export class AgentModeStoreService implements OnModuleDestroy {
  private readonly modePath: string;
  private readonly jsonWriter: SequentialJsonWriter;
  private cached: AgentModeValue | null = null;

  constructor(private readonly config: ConfigService) {
    // Mode is a global runtime signal — stored at DATA_DIR root, not per-conversation.
    const dataDir = this.config.getDataDir();
    this.modePath = join(dataDir, 'mode.json');
    this.jsonWriter = new SequentialJsonWriter(
      this.modePath,
      () => ({ mode: this.cached ?? DEFAULT_AGENT_MODE }),
      this.config.getEncryptionKey(),
    );
    this.ensureDataDir();
  }

  /** Return the persisted mode, or the default when nothing is stored yet. */
  get(): AgentModeValue {
    const stored = this.getStored();
    return stored ?? DEFAULT_AGENT_MODE;
  }

  /**
   * Validate and persist a new mode.
   * Accepts both canonical keys ("exploring") and display strings ("Exploring...").
   * Returns the resolved display string, or `null` when the input is invalid.
   */
  set(raw: string): AgentModeValue | null {
    const resolved = resolveAgentMode(raw);
    if (!resolved) return null;
    this.cached = resolved;
    this.jsonWriter.schedule();
    return resolved;
  }

  flush(): Promise<void> {
    return this.jsonWriter.flush();
  }

  onModuleDestroy(): Promise<void> {
    return this.flush();
  }

  private getStored(): AgentModeValue | null {
    if (this.cached !== null) return this.cached;
    if (!existsSync(this.modePath)) {
      return null;
    }
    try {
      const raw = readFileSync(this.modePath, 'utf8');
      const decrypted = decryptData(raw, this.config.getEncryptionKey());
      const data = JSON.parse(decrypted) as { mode?: string };
      const resolved = data.mode ? resolveAgentMode(data.mode) : null;
      this.cached = resolved ?? DEFAULT_AGENT_MODE;
      return this.cached;
    } catch {
      this.cached = DEFAULT_AGENT_MODE;
      return this.cached;
    }
  }

  private ensureDataDir(): void {
    const dataDir = this.config.getDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }
}
