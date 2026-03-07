import { describe, test, expect, afterEach } from 'bun:test';
import { StrategyRegistryService } from './strategy-registry.service';
import { MockStrategy } from './mock.strategy';

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

  test('resolveStrategy returns MockStrategy when AGENT_PROVIDER not set', () => {
    delete process.env.AGENT_PROVIDER;
    const service = new StrategyRegistryService();
    expect(service.resolveStrategy()).toBeInstanceOf(MockStrategy);
  });

  test('resolveStrategy throws for unknown provider', () => {
    process.env.AGENT_PROVIDER = 'unknown';
    const service = new StrategyRegistryService();
    expect(() => service.resolveStrategy()).toThrow('Unknown AGENT_PROVIDER');
  });
});
