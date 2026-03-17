import { describe, test, expect, afterEach } from 'bun:test';
import { StrategyRegistryService } from './strategy-registry.service';
import { MockStrategy } from './mock.strategy';
import { ClaudeCodeStrategy } from './claude-code.strategy';
import { OpencodeStrategy } from './opencode.strategy';

describe('StrategyRegistryService', () => {
  const envBackup = process.env.AGENT_PROVIDER;

  afterEach(() => {
    process.env.AGENT_PROVIDER = envBackup;
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
});
