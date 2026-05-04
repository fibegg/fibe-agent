import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ConversationManagerService,
  DEFAULT_CONVERSATION_ID,
  DEFAULT_CONVERSATION_TITLE,
  INBOX_CONVERSATION_ID,
  INBOX_CONVERSATION_TITLE,
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
        readonly: false,
        system: false,
        hiddenWhenEmpty: false,
      }),
    );
    expect(manager.get(DEFAULT_CONVERSATION_ID)).toBeTruthy();
  });

  test('creates protected inbox conversation hidden while empty', () => {
    const manager = createManager();

    expect(manager.list().find((m) => m.id === INBOX_CONVERSATION_ID)).toBeUndefined();
    expect(manager.get(INBOX_CONVERSATION_ID)?.meta).toEqual(
      expect.objectContaining({
        id: INBOX_CONVERSATION_ID,
        title: INBOX_CONVERSATION_TITLE,
        readonly: true,
        system: true,
        hiddenWhenEmpty: true,
      }),
    );
  });

  test('does not delete protected system conversations', () => {
    const manager = createManager();

    expect(manager.delete(DEFAULT_CONVERSATION_ID)).toBe(false);
    expect(manager.delete(INBOX_CONVERSATION_ID)).toBe(false);
    expect(manager.get(DEFAULT_CONVERSATION_ID)).toBeTruthy();
    expect(manager.get(INBOX_CONVERSATION_ID)).toBeTruthy();
  });

  test('does not rename protected system conversations', () => {
    const manager = createManager();

    expect(manager.setTitle(DEFAULT_CONVERSATION_ID, 'Renamed')).toBe(false);
    expect(manager.setTitle(INBOX_CONVERSATION_ID, 'Renamed')).toBe(false);
    expect(manager.get(DEFAULT_CONVERSATION_ID)?.meta.title).toBe(DEFAULT_CONVERSATION_TITLE);
    expect(manager.get(INBOX_CONVERSATION_ID)?.meta.title).toBe(INBOX_CONVERSATION_TITLE);
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

  test('startup retry cleans tombstoned conversation directories', () => {
    const conversationsDir = join(dataDir, 'conversations');
    const staleDir = join(conversationsDir, 'stale-conversation');
    const tombstonesPath = join(conversationsDir, 'tombstones.json');
    mkdirSync(staleDir, { recursive: true });
    writeFileSync(join(staleDir, 'leftover.txt'), 'stale', 'utf8');
    writeFileSync(tombstonesPath, JSON.stringify([
      { id: 'stale-conversation', dir: staleDir, tombstonedAt: new Date().toISOString() },
    ]), 'utf8');

    createManager();

    expect(existsSync(staleDir)).toBe(false);
    expect(existsSync(tombstonesPath)).toBe(false);
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
    const markerPath = join(dataDir, 'conversations', id, '.claude_session');
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

  test('default conversation falls back to legacy workspace session marker', () => {
    const manager = createManager();
    const legacyWorkspaceDir = join(dataDir, 'claude_workspace');
    mkdirSync(legacyWorkspaceDir, { recursive: true });
    writeFileSync(join(legacyWorkspaceDir, '.claude_session'), 'legacy-default-session', 'utf8');

    expect(manager.getClaudeSessionMarker(DEFAULT_CONVERSATION_ID)).toBe('legacy-default-session');

    manager.setClaudeSessionMarker(DEFAULT_CONVERSATION_ID, null);
    expect(manager.getClaudeSessionMarker(DEFAULT_CONVERSATION_ID)).toBeNull();
    expect(existsSync(join(legacyWorkspaceDir, '.claude_session'))).toBe(false);
  });
});
