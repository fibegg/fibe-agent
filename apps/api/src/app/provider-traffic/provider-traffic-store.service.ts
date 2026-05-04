import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '../config/config.service';
import { FibeSyncService } from '../fibe-sync/fibe-sync.service';
import { SequentialJsonWriter } from '../persistence/sequential-json-writer';
import { decryptData } from '../crypto/crypto.util';
import type { CapturedProviderRequest } from './types';
import { ConversationManagerService, DEFAULT_CONVERSATION_ID } from '../conversation/conversation-manager.service';

interface TrafficState {
  jsonWriter: SequentialJsonWriter;
  records: CapturedProviderRequest[];
}

@Injectable()
export class ProviderTrafficStoreService implements OnModuleDestroy {
  private readonly states = new Map<string, TrafficState>();

  constructor(
    private readonly config: ConfigService,
    private readonly fibeSync: FibeSyncService,
    @Optional() private readonly conversationManager?: ConversationManagerService,
  ) {
  }

  append(record: CapturedProviderRequest, conversationId = DEFAULT_CONVERSATION_ID): void {
    const state = this.stateFor(conversationId);
    state.records.push(record);
    state.jsonWriter.schedule();
    void this.fibeSync.syncRawProviders(() => JSON.stringify(state.records), conversationId);
  }

  all(conversationId = DEFAULT_CONVERSATION_ID): CapturedProviderRequest[] {
    return this.stateFor(conversationId).records;
  }

  clear(conversationId = DEFAULT_CONVERSATION_ID): void {
    const state = this.stateFor(conversationId);
    state.records = [];
    state.jsonWriter.schedule();
  }

  async flush(): Promise<void> {
    await Promise.all([...this.states.values()].map((state) => state.jsonWriter.flush()));
  }

  onModuleDestroy(): Promise<void> {
    return this.flush();
  }

  private stateFor(conversationId: string): TrafficState {
    const id = conversationId || DEFAULT_CONVERSATION_ID;
    const existing = this.states.get(id);
    if (existing) return existing;
    const dataDir = this.conversationManager
      ? this.conversationManager.dataDirFor(id)
      : this.config.getConversationDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    const filePath = join(dataDir, 'raw-providers.json');
    const state: TrafficState = {
      records: this.load(filePath),
      jsonWriter: undefined as unknown as SequentialJsonWriter,
    };
    state.jsonWriter = new SequentialJsonWriter(
      filePath,
      () => state.records,
      this.config.getEncryptionKey(),
    );
    this.states.set(id, state);
    return state;
  }

  private load(filePath: string): CapturedProviderRequest[] {
    if (!existsSync(filePath)) return [];
    try {
      const raw = readFileSync(filePath, 'utf8');
      const decrypted = decryptData(raw, this.config.getEncryptionKey());
      const data = JSON.parse(decrypted);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('Failed to parse raw-providers.json:', err);
      return [];
    }
  }
}
