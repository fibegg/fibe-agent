import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
    expect(existsSync(convDir)).toBe(true);

    const ok = manager.delete(meta.id);
    expect(ok).toBe(true);
    expect(existsSync(convDir)).toBe(false);
    expect(manager.list().find((m) => m.id === meta.id)).toBeUndefined();
  });

  // ── Per-conversation model / effort ──────────────────────────────────────

  test('getConversationModel returns null when not set', () => {
    const manager = createManager();
    const { id } = manager.create('test');
    expect(manager.getConversationModel(id)).toBeNull();
  });

  test('setConversationModel persists and is readable', () => {
    const manager = createManager();
    const { id } = manager.create('test');

    expect(manager.setConversationModel(id, 'claude-opus-4-5')).toBe(true);
    expect(manager.getConversationModel(id)).toBe('claude-opus-4-5');

    // Persisted to index — a fresh manager load should see it
    const manager2 = createManager();
    expect(manager2.getConversationModel(id)).toBe('claude-opus-4-5');
  });

  test('setConversationModel with empty string clears the override', () => {
    const manager = createManager();
    const { id } = manager.create('test');
    manager.setConversationModel(id, 'some-model');
    manager.setConversationModel(id, '');
    expect(manager.getConversationModel(id)).toBeNull();
  });

  test('setConversationEffort persists and is readable', () => {
    const manager = createManager();
    const { id } = manager.create('test');

    expect(manager.setConversationEffort(id, 'high')).toBe(true);
    expect(manager.getConversationEffort(id)).toBe('high');
  });

  // ── Claude session marker ─────────────────────────────────────────────────

  test('getClaudeSessionMarker returns null when no marker exists', () => {
    const manager = createManager();
    const { id } = manager.create('claude-test');
    expect(manager.getClaudeSessionMarker(id)).toBeNull();
  });

  test('setClaudeSessionMarker writes marker and getClaudeSessionMarker reads it', () => {
    const manager = createManager();
    const { id } = manager.create('claude-test');
    const sessionId = 'abc-123-native-session';

    expect(manager.setClaudeSessionMarker(id, sessionId)).toBe(true);
    expect(manager.getClaudeSessionMarker(id)).toBe(sessionId);

    // Verify the file is on disk in the expected location
    const markerPath = join(dataDir, 'conversations', id, 'claude_workspace', '.claude_session');
    expect(existsSync(markerPath)).toBe(true);
    expect(readFileSync(markerPath, 'utf8').trim()).toBe(sessionId);
  });

  test('setClaudeSessionMarker(null) clears an existing marker', () => {
    const manager = createManager();
    const { id } = manager.create('claude-test');
    manager.setClaudeSessionMarker(id, 'some-session');
    manager.setClaudeSessionMarker(id, null);
    expect(manager.getClaudeSessionMarker(id)).toBeNull();
  });
});
