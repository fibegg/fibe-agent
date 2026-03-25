import { describe, test, expect, beforeEach, vi } from 'bun:test';
import { DataPrivacyService } from './data-privacy.service';
import { ConfigService } from '../config/config.service';
import { MessageStoreService } from '../message-store/message-store.service';
import { ActivityStoreService } from '../activity-store/activity-store.service';
import { ModelStoreService } from '../model-store/model-store.service';
import * as fs from 'node:fs';

describe('DataPrivacyService', () => {
  let service: DataPrivacyService;
  let mockConfig: unknown;
  let mockMessageStore: unknown;
  let mockActivityStore: unknown;
  let mockModelStore: unknown;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      getConversationId: vi.fn().mockReturnValue('test-conv-id'),
      getConversationDataDir: vi.fn().mockReturnValue('/mock/data/dir'),
    };
    mockMessageStore = {
      all: vi.fn().mockReturnValue([{ id: 'msg1' }]),
      clear: vi.fn(),
    };
    mockActivityStore = {
      all: vi.fn().mockReturnValue([{ id: 'act1' }]),
      clear: vi.fn(),
    };
    mockModelStore = {
      get: vi.fn().mockReturnValue('mock-model'),
    };

    service = new DataPrivacyService(
      mockConfig as ConfigService,
      mockMessageStore as MessageStoreService,
      mockActivityStore as ActivityStoreService,
      mockModelStore as ModelStoreService
    );
  });

  test('exportData returns consolidated JSON state', () => {
    const data = service.exportData();
    expect(data.messages).toEqual([{ id: 'msg1' }]);
    expect(data.activities).toEqual([{ id: 'act1' }]);
    expect(data.model).toBe('mock-model');
    expect(data.agent_id).toBe('test-conv-id');
    expect(data.exported_at).toBeDefined();
  });

  test('deleteData clears stores and removes directory', () => {
    const rmSyncSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => {});
    
    service.deleteData();
    // @ts-expect-error mock
    expect(mockMessageStore.clear).toHaveBeenCalled();
    // @ts-expect-error mock
    expect(mockActivityStore.clear).toHaveBeenCalled();
    expect(rmSyncSpy).toHaveBeenCalledWith('/mock/data/dir', { recursive: true, force: true });
    
    rmSyncSpy.mockRestore();
  });

  test('deleteData catches filesystem errors gracefully', () => {
    const rmSyncSpy = vi.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
      throw new Error('Test error');
    });
    // Should not throw
    expect(() => service.deleteData()).not.toThrow();
    // @ts-expect-error mock
    expect(mockMessageStore.clear).toHaveBeenCalled();
    
    rmSyncSpy.mockRestore();
  });
});
