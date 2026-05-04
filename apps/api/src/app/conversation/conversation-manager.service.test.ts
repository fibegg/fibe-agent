import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ConversationManagerService,
  DEFAULT_CONVERSATION_ID,
  DEFAULT_CONVERSATION_TITLE,
} from './conversation-manager.service';

describe('ConversationManagerService', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'conv-manager-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  function createManager(): ConversationManagerService {
    return new ConversationManagerService({
      getDataDir: () => dataDir,
      getConversationDataDir: () => dataDir,
      getEncryptionKey: () => undefined,
    } as never);
  }

  test('always exposes the protected default conversation', () => {
    const manager = createManager();

    expect(manager.list()).toContainEqual(
      expect.objectContaining({
        id: DEFAULT_CONVERSATION_ID,
        title: DEFAULT_CONVERSATION_TITLE,
      }),
    );
    expect(manager.get(DEFAULT_CONVERSATION_ID)).toBeTruthy();
  });

  test('does not delete the default conversation', () => {
    const manager = createManager();

    expect(manager.delete(DEFAULT_CONVERSATION_ID)).toBe(false);
    expect(manager.get(DEFAULT_CONVERSATION_ID)).toBeTruthy();
  });

  test('does not rename the default conversation', () => {
    const manager = createManager();

    expect(manager.setTitle(DEFAULT_CONVERSATION_ID, 'Renamed')).toBe(false);
    expect(manager.get(DEFAULT_CONVERSATION_ID)?.meta.title).toBe(DEFAULT_CONVERSATION_TITLE);
  });

  test('delete() removes the conversation directory from disk', () => {
    const manager = createManager();
    const meta = manager.create('To be deleted');
    const convDir = join(dataDir, 'conversations', meta.id);
    // Directory was created by createBundle()
    expect(existsSync(convDir)).toBe(true);

    const ok = manager.delete(meta.id);
    expect(ok).toBe(true);
    // Directory should be gone
    expect(existsSync(convDir)).toBe(false);
    // Not in the list anymore
    expect(manager.list().find((m) => m.id === meta.id)).toBeUndefined();
  });
});
