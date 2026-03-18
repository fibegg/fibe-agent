import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ConfigService } from './config.service';
import { join } from 'node:path';

describe('ConfigService', () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    envBackup.AGENT_PASSWORD = process.env.AGENT_PASSWORD;
    envBackup.MODEL_OPTIONS = process.env.MODEL_OPTIONS;
    envBackup.DEFAULT_MODEL = process.env.DEFAULT_MODEL;
    envBackup.DATA_DIR = process.env.DATA_DIR;
    envBackup.SYSTEM_PROMPT_PATH = process.env.SYSTEM_PROMPT_PATH;
    envBackup.PLAYGROUNDS_DIR = process.env.PLAYGROUNDS_DIR;
    envBackup.POST_INIT_SCRIPT = process.env.POST_INIT_SCRIPT;
    envBackup.PSOT_INIT_SCRIPT = process.env.PSOT_INIT_SCRIPT;
  });

  afterEach(() => {
    process.env.AGENT_PASSWORD = envBackup.AGENT_PASSWORD;
    process.env.MODEL_OPTIONS = envBackup.MODEL_OPTIONS;
    process.env.DEFAULT_MODEL = envBackup.DEFAULT_MODEL;
    process.env.DATA_DIR = envBackup.DATA_DIR;
    process.env.SYSTEM_PROMPT_PATH = envBackup.SYSTEM_PROMPT_PATH;
    process.env.PLAYGROUNDS_DIR = envBackup.PLAYGROUNDS_DIR;
    process.env.POST_INIT_SCRIPT = envBackup.POST_INIT_SCRIPT;
    process.env.PSOT_INIT_SCRIPT = envBackup.PSOT_INIT_SCRIPT;
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

  test('getDefaultModel returns DEFAULT_MODEL when set', () => {
    process.env.DEFAULT_MODEL = 'pro';
    process.env.MODEL_OPTIONS = 'flash,flash-lite';
    expect(new ConfigService().getDefaultModel()).toBe('pro');
  });

  test('getDefaultModel returns first of MODEL_OPTIONS when DEFAULT_MODEL not set', () => {
    delete process.env.DEFAULT_MODEL;
    process.env.MODEL_OPTIONS = 'flash-lite,flash,pro';
    expect(new ConfigService().getDefaultModel()).toBe('flash-lite');
  });

  test('getDefaultModel returns empty string when no options', () => {
    delete process.env.DEFAULT_MODEL;
    delete process.env.MODEL_OPTIONS;
    expect(new ConfigService().getDefaultModel()).toBe('');
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

  test('getPostInitScript returns undefined when neither env set', () => {
    delete process.env.POST_INIT_SCRIPT;
    delete process.env.PSOT_INIT_SCRIPT;
    expect(new ConfigService().getPostInitScript()).toBeUndefined();
  });

  test('getPostInitScript returns POST_INIT_SCRIPT when set', () => {
    process.env.POST_INIT_SCRIPT = 'echo hello';
    expect(new ConfigService().getPostInitScript()).toBe('echo hello');
  });

  test('getPostInitScript returns PSOT_INIT_SCRIPT when POST_INIT_SCRIPT not set', () => {
    delete process.env.POST_INIT_SCRIPT;
    process.env.PSOT_INIT_SCRIPT = 'echo typo';
    expect(new ConfigService().getPostInitScript()).toBe('echo typo');
  });

  test('getPostInitScript prefers POST_INIT_SCRIPT over PSOT_INIT_SCRIPT', () => {
    process.env.POST_INIT_SCRIPT = 'correct';
    process.env.PSOT_INIT_SCRIPT = 'typo';
    expect(new ConfigService().getPostInitScript()).toBe('correct');
  });

  test('getPostInitScript returns undefined for empty or whitespace', () => {
    process.env.POST_INIT_SCRIPT = '   ';
    expect(new ConfigService().getPostInitScript()).toBeUndefined();
  });
});
