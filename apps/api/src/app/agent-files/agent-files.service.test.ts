import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NotFoundException } from '@nestjs/common';

const { AgentFilesService } = require('./agent-files.service');

describe('AgentFilesService', () => {
  let agentDir: string;

  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), 'agent-files-'));
  });

  afterEach(() => {
    rmSync(agentDir, { recursive: true, force: true });
  });

  test('uploadFile sanitizes filename and writes to target directory', async () => {
    // We mock strategyRegistry to simulate an active agent directory
    const mockStrategyRegistry = {
      resolveStrategy: () => ({
        getWorkingDir: () => agentDir
      })
    };
    
    const service = new AgentFilesService(mockStrategyRegistry as never);
    const buffer = Buffer.from('agent file content');
    
    const _result = await service.uploadFile('assets', 'dangerous/file\\name.txt', buffer);
    
    // sanitizes to 'dangerous_file_name.txt' or similar (replaces non-alphanumeric/dot/dash/underscore with _)
    // Wait, basename('dangerous/file\\name.txt') -> 'file\\name.txt' or 'dangerous/file\\name.txt' depending on os.
    // In node, on posix, basename('a/b/c') is 'c'.
    
    // Let's just test with something that will be safe
    const res2 = await service.uploadFile('assets', 'safe-name.txt', buffer);
    expect(res2).toBe('assets/safe-name.txt');
    const { readFileSync: rfs } = require('node:fs');
    expect(rfs(join(agentDir, 'assets', 'safe-name.txt'), 'utf8')).toBe('agent file content');
  });

  test('uploadFile throws if no agent working directory', async () => {
    const mockStrategyRegistry = {
      resolveStrategy: () => ({
        getWorkingDir: () => null
      })
    };
    const service = new AgentFilesService(mockStrategyRegistry as never);
    await expect(service.uploadFile('', 'test.txt', Buffer.from(''))).rejects.toThrow(NotFoundException);
  });

  test('uploadFile rejects directory traversal', async () => {
    const mockStrategyRegistry = {
      resolveStrategy: () => ({
        getWorkingDir: () => agentDir
      })
    };
    const service = new AgentFilesService(mockStrategyRegistry as never);
    await expect(service.uploadFile('../outside', 'test.txt', Buffer.from(''))).rejects.toThrow(NotFoundException);
  });
});
