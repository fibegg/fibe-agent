import { describe, test, expect, afterEach } from 'bun:test';
import { StrategyRegistryService } from './strategy-registry.service';
import { MockStrategy } from './mock.strategy';
import { ClaudeCodeStrategy } from './claude-code.strategy';
import { GeminiStrategy } from './gemini.strategy';
import { OpenaiCodexStrategy } from './openai-codex.strategy';
import { OpencodeStrategy } from './opencode.strategy';

describe('StrategyRegistryService', () => {
  const envBackup = process.env.AGENT_PROVIDER;
  const authModeBackup = process.env.AGENT_AUTH_MODE;

  afterEach(() => {
    process.env.AGENT_PROVIDER = envBackup;
    process.env.AGENT_AUTH_MODE = authModeBackup;
  });

  test('resolveStrategy returns MockStrategy when AGENT_PROVIDER is mock', () => {
    process.env.AGENT_PROVIDER = 'mock';
    const service = new StrategyRegistryService();
    expect(service.resolveStrategy()).toBeInstanceOf(MockStrategy);
  });

  test('resolveStrategy returns ClaudeCodeStrategy when AGENT_PROVIDER not set', () => {
    delete process.env.AGENT_PROVIDER;
    const service = new StrategyRegistryService();
    expect(service.resolveStrategy()).toBeInstanceOf(ClaudeCodeStrategy);
  });

  test('resolveStrategy throws for unknown provider', () => {
    process.env.AGENT_PROVIDER = 'unknown';
    const service = new StrategyRegistryService();
    expect(() => service.resolveStrategy()).toThrow('Unknown AGENT_PROVIDER');
  });

  test('resolveStrategy returns OpencodeStrategy when AGENT_PROVIDER is opencode', () => {
    process.env.AGENT_PROVIDER = 'opencode';
    const service = new StrategyRegistryService();
    expect(service.resolveStrategy()).toBeInstanceOf(OpencodeStrategy);
  });

  test('resolveStrategy returns OpencodeStrategy when AGENT_PROVIDER is opencodex (alias)', () => {
    process.env.AGENT_PROVIDER = 'opencodex';
    const service = new StrategyRegistryService();
    expect(service.resolveStrategy()).toBeInstanceOf(OpencodeStrategy);
  });

  test('resolveStrategy returns OpenaiCodexStrategy when AGENT_PROVIDER is openai-codex', () => {
    process.env.AGENT_PROVIDER = 'openai-codex';
    const service = new StrategyRegistryService();
    expect(service.resolveStrategy()).toBeInstanceOf(OpenaiCodexStrategy);
  });

  test('resolveStrategy returns OpenaiCodexStrategy when AGENT_PROVIDER is openai', () => {
    process.env.AGENT_PROVIDER = 'openai';
    const service = new StrategyRegistryService();
    expect(service.resolveStrategy()).toBeInstanceOf(OpenaiCodexStrategy);
  });

  test('resolveStrategy returns GeminiStrategy when AGENT_PROVIDER is gemini', () => {
    process.env.AGENT_PROVIDER = 'gemini';
    const service = new StrategyRegistryService();
    expect(service.resolveStrategy()).toBeInstanceOf(GeminiStrategy);
  });

  test('resolveStrategy with AGENT_AUTH_MODE=api-token uses api-token mode for Gemini', async () => {
    process.env.AGENT_PROVIDER = 'gemini';
    process.env.AGENT_AUTH_MODE = 'api-token';
    delete process.env.GEMINI_API_KEY;
    const service = new StrategyRegistryService();
    const strategy = service.resolveStrategy();
    expect(strategy).toBeInstanceOf(GeminiStrategy);
    const status = await strategy.checkAuthStatus();
    expect(status).toBe(false);
  });
});
