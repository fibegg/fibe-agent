import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { RuntimeConfigController } from './runtime-config.controller';
import { StrategyRegistryService } from '../strategies/strategy-registry.service';

describe('RuntimeConfigController', () => {
  const envNames = [
    'USER_AVATAR_URL', 'USER_AVATAR_BASE64', 'ASSISTANT_AVATAR_URL',
    'ASSISTANT_AVATAR_BASE64', 'AGENT_PROVIDER', 'SIMPLICATE', 'LOCK_CHAT_MODEL',
    'CODEX_AGENT_TRANSPORT', 'CODEX_USE_APP_SERVER',
    'OPENCODE_AGENT_TRANSPORT', 'OPENCODE_USE_APP_SERVER',
  ] as const;
  let envBackup: Record<string, string | undefined>;
  const controller = new RuntimeConfigController({
    resolveStrategy: () => ({}),
  } as unknown as StrategyRegistryService);

  beforeEach(() => {
    envBackup = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
    for (const name of envNames) delete process.env[name];
  });

  afterEach(() => {
    for (const name of envNames) {
      const value = envBackup[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  test('returns defaults from the real controller', () => {
    expect(controller.getConfig()).toEqual({
      userAvatarUrl: null,
      userAvatarBase64: null,
      assistantAvatarUrl: null,
      assistantAvatarBase64: null,
      agentProvider: 'claude-code',
      agentProviderLabel: 'Claude',
      simplicate: false,
      lockChatModel: false,
      structuredOutput: false,
    });
  });

  test('returns configured avatars and trims optional values', () => {
    process.env.USER_AVATAR_URL = '  https://example.com/user.png  ';
    process.env.USER_AVATAR_BASE64 = 'dXNlcg==';
    process.env.ASSISTANT_AVATAR_URL = 'https://example.com/bot.png';
    process.env.ASSISTANT_AVATAR_BASE64 = 'Ym90';
    expect(controller.getConfig()).toMatchObject({
      userAvatarUrl: 'https://example.com/user.png',
      userAvatarBase64: 'dXNlcg==',
      assistantAvatarUrl: 'https://example.com/bot.png',
      assistantAvatarBase64: 'Ym90',
    });
    process.env.USER_AVATAR_URL = '   ';
    expect(controller.getConfig().userAvatarUrl).toBeNull();
  });

  for (const [provider, label] of [
    ['claude-code', 'Claude'], ['openai-codex', 'Codex'], ['openai', 'Codex'],
    ['  gemini  ', 'Gemini'], ['antigravity', 'Antigravity'],
    ['opencode', 'OpenCode'], ['opencodex', 'OpenCode'], ['cursor', 'Cursor'],
    ['mock', 'Mock'],
  ]) {
    test(`labels ${provider}`, () => {
      process.env.AGENT_PROVIDER = provider;
      expect(controller.getConfig()).toMatchObject({
        agentProvider: provider.trim(), agentProviderLabel: label,
      });
    });
  }

  test('exposes model lock and simplicate using their configured boolean values', () => {
    for (const [value, expected] of [
      [undefined, false], ['', false], ['false', false], ['0', false],
      ['1', true], ['true', true], [' YES ', true],
    ] as const) {
      if (value === undefined) {
        delete process.env.LOCK_CHAT_MODEL;
        delete process.env.SIMPLICATE;
      } else {
        process.env.LOCK_CHAT_MODEL = value;
        process.env.SIMPLICATE = value;
      }
      expect(controller.getConfig()).toMatchObject({ lockChatModel: expected, simplicate: expected });
    }
  });

  const transports = [
    ['claude-code', undefined, undefined, true],
    ['openai-codex', 'CODEX_AGENT_TRANSPORT', 'app-server', true],
    ['openai', 'CODEX_AGENT_TRANSPORT', 'appserver', true],
    ['openai-codex', 'CODEX_AGENT_TRANSPORT', 'exec', false],
    ['openai-codex', 'CODEX_AGENT_TRANSPORT', 'cli', false],
    ['openai-codex', 'CODEX_USE_APP_SERVER', 'false', false],
    ['opencode', 'OPENCODE_AGENT_TRANSPORT', 'app-server', true],
    ['opencodex', 'OPENCODE_AGENT_TRANSPORT', 'appserver', true],
    ['opencode', 'OPENCODE_AGENT_TRANSPORT', 'run', false],
    ['opencode', 'OPENCODE_AGENT_TRANSPORT', 'cli', false],
    ['opencode', 'OPENCODE_USE_APP_SERVER', 'false', false],
    ['gemini', undefined, undefined, false],
    ['antigravity', undefined, undefined, false],
    ['cursor', undefined, undefined, false],
    ['mock', undefined, undefined, false],
  ] as const;

  for (const [provider, transportVariable, transport, supported] of transports) {
    test(`reports structured capability for ${provider}/${transport ?? 'default'} without invoking the provider`, () => {
      process.env.AGENT_PROVIDER = provider;
      if (transportVariable) process.env[transportVariable] = transport;
      const registry = new StrategyRegistryService({
        getConversationDataDir: () => '/tmp/runtime-config-test',
        getEncryptionKey: () => undefined,
      } as never);
      const strategy = registry.resolveStrategy();
      const resolve = spyOn(registry, 'resolveStrategy').mockReturnValue(strategy);
      const execute = spyOn(strategy, 'executePromptStreaming');
      expect(new RuntimeConfigController(registry).getConfig().structuredOutput).toBe(supported);
      expect(resolve).toHaveBeenCalledTimes(1);
      expect(execute).not.toHaveBeenCalled();
    });
  }
});
