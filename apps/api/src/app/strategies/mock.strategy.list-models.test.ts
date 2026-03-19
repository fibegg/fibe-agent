import { describe, test, expect } from 'bun:test';
import { MockStrategy } from './mock.strategy';

describe('MockStrategy.listModels', () => {
  test('returns hardcoded model list', async () => {
    const strategy = new MockStrategy();
    const models = await strategy.listModels();
    expect(models).toEqual(['mock-model-a', 'mock-model-b', 'mock-model-c']);
  });
});
