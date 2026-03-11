import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ConfigService } from './config.service';
import { join } from 'node:path';

describe('ConfigService', () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    envBackup.AGENT_PASSWORD = process.env.AGENT_PASSWORD;
    envBackup.MODEL_OPTIONS = process.env.MODEL_OPTIONS;
    envBackup.DATA_DIR = process.env.DATA_DIR;
    envBackup.SYSTEM_PROMPT_PATH = process.env.SYSTEM_PROMPT_PATH;
    envBackup.PLAYGROUNDS_DIR = process.env.PLAYGROUNDS_DIR;
  });

  afterEach(() => {
    process.env.AGENT_PASSWORD = envBackup.AGENT_PASSWORD;
    process.env.MODEL_OPTIONS = envBackup.MODEL_OPTIONS;
    process.env.DATA_DIR = envBackup.DATA_DIR;
    process.env.SYSTEM_PROMPT_PATH = envBackup.SYSTEM_PROMPT_PATH;
    process.env.PLAYGROUNDS_DIR = envBackup.PLAYGROUNDS_DIR;
  });

  test('getAgentPassword returns undefined when AGENT_PASSWORD not set', () => {
    delete process.env.AGENT_PASSWORD;
    expect(new ConfigService().getAgentPassword()).toBeUndefined();
  });

  test('getAgentPassword returns value when AGENT_PASSWORD set', () => {
    process.env.AGENT_PASSWORD = 'secret';
    expect(new ConfigService().getAgentPassword()).toBe('secret');
  });

  test('getModelOptions returns empty array when MODEL_OPTIONS not set', () => {
    delete process.env.MODEL_OPTIONS;
    expect(new ConfigService().getModelOptions()).toEqual([]);
  });

  test('getModelOptions returns trimmed non-empty parts', () => {
    process.env.MODEL_OPTIONS = ' a , , b ';
    expect(new ConfigService().getModelOptions()).toEqual(['a', 'b']);
  });

  test('getDataDir returns DATA_DIR when set', () => {
    process.env.DATA_DIR = '/custom/data';
    expect(new ConfigService().getDataDir()).toBe('/custom/data');
  });

  test('getDataDir returns default under cwd when not set', () => {
    delete process.env.DATA_DIR;
    expect(new ConfigService().getDataDir()).toBe(join(process.cwd(), 'data'));
  });

  test('getSystemPromptPath returns env when set', () => {
    process.env.SYSTEM_PROMPT_PATH = '/path/to/prompt.md';
    expect(new ConfigService().getSystemPromptPath()).toBe('/path/to/prompt.md');
  });

  test('getSystemPromptPath returns default dist path when not set', () => {
    delete process.env.SYSTEM_PROMPT_PATH;
    expect(new ConfigService().getSystemPromptPath()).toBe(join(process.cwd(), 'dist', 'assets', 'SYSTEM_PROMPT.md'));
  });

  test('getPlaygroundsDir returns PLAYGROUNDS_DIR when set', () => {
    process.env.PLAYGROUNDS_DIR = '/custom/playground';
    expect(new ConfigService().getPlaygroundsDir()).toBe('/custom/playground');
  });

  test('getPlaygroundsDir returns default under cwd when not set', () => {
    delete process.env.PLAYGROUNDS_DIR;
    expect(new ConfigService().getPlaygroundsDir()).toBe(join(process.cwd(), 'playground'));
  });
});
