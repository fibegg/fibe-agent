import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ConversationManagerService,
  DEFAULT_CONVERSATION_ID,
  DEFAULT_CONVERSATION_TITLE,
  INBOX_CONVERSATION_ID,
  INBOX_CONVERSATION_TITLE,
  INTERRUPTED_TURN_NOTICE,
  TURN_MARKER_FILE,
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

    expect(
      manager.list().find((m) => m.id === INBOX_CONVERSATION_ID),
    ).toBeUndefined();
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
    expect(manager.get(DEFAULT_CONVERSATION_ID)?.meta.title).toBe(
      DEFAULT_CONVERSATION_TITLE,
    );
    expect(manager.get(INBOX_CONVERSATION_ID)?.meta.title).toBe(
      INBOX_CONVERSATION_TITLE,
    );
  });

  test('createWithId is idempotent for safe external conversation ids', () => {
    const manager = createManager();

    const created = manager.createWithId('likeable-123', 'Likeable Project');
    const again = manager.createWithId('likeable-123', 'Updated Project');

    expect(created.id).toBe('likeable-123');
    expect(again.id).toBe('likeable-123');
    expect(again.title).toBe('Updated Project');
    expect(manager.get('likeable-123')).toBeTruthy();
  });

  test('createWithId rejects unsafe external conversation ids', () => {
    const manager = createManager();

    expect(() => manager.createWithId('../escape', 'bad')).toThrow(
      /conversation id/,
    );
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
    writeFileSync(
      tombstonesPath,
      JSON.stringify([
        {
          id: 'stale-conversation',
          dir: staleDir,
          tombstonedAt: new Date().toISOString(),
        },
      ]),
      'utf8',
    );

    createManager();

    expect(existsSync(staleDir)).toBe(false);
    expect(existsSync(tombstonesPath)).toBe(false);
  });

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
    writeFileSync(
      join(legacyWorkspaceDir, '.claude_session'),
      'legacy-default-session',
      'utf8',
    );

    expect(manager.getClaudeSessionMarker(DEFAULT_CONVERSATION_ID)).toBe(
      'legacy-default-session',
    );

    manager.setClaudeSessionMarker(DEFAULT_CONVERSATION_ID, null);
    expect(manager.getClaudeSessionMarker(DEFAULT_CONVERSATION_ID)).toBeNull();
    expect(existsSync(join(legacyWorkspaceDir, '.claude_session'))).toBe(false);
  });

  test('turn marker round-trips and clears', () => {
    const manager = createManager();
    const id = manager.create('t').id;
    const file = join(manager.dataDirFor(id), TURN_MARKER_FILE);
    manager.markTurnStarted(id, 'm1');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ userMessageId: 'm1' });
    manager.clearTurnMarker(id);
    expect(existsSync(file)).toBe(false);
  });

  test('startup recovery appends exactly one notice and a second startup adds nothing', async () => {
    const first = createManager();
    const id = first.create('t').id;
    first.markTurnStarted(id);
    await new Promise((resolve) => setTimeout(resolve, 400)); // index write is debounced 300ms
    await first.onModuleDestroy();

    const second = createManager();
    expect(await second.recoverInterruptedTurns()).toEqual([id]);
    const notices = () =>
      second.messages(id).filter((m) => m.role === 'assistant' && m.body === INTERRUPTED_TURN_NOTICE);
    expect(notices()).toHaveLength(1);
    expect(existsSync(join(second.dataDirFor(id), TURN_MARKER_FILE))).toBe(false);
    await second.onModuleDestroy();

    const third = createManager();
    expect(await third.recoverInterruptedTurns()).toEqual([]);
    expect(third.messages(id).filter((m) => m.body === INTERRUPTED_TURN_NOTICE)).toHaveLength(1);
  });

  test('no marker means no change', async () => {
    const manager = createManager();
    const id = manager.create('t').id;
    expect(await manager.recoverInterruptedTurns()).toEqual([]);
    expect(manager.messages(id)).toHaveLength(0);
  });
});
