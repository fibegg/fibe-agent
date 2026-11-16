import { describe, test, expect } from 'bun:test';
import { ModelOptionsController } from './model-options.controller';

function controller(envModels: string[], listModels?: () => Promise<string[]>) {
  return new ModelOptionsController(
    { getModelOptions: () => envModels } as never,
    { resolveStrategy: () => ({ listModels }) } as never,
  );
}

describe('ModelOptionsController', () => {
  test('keeps configured model ordering without querying the provider in the initial response', async () => {
    let discoveryCalls = 0;
    const instance = controller(['custom-model', 'gpt-6.1-sol'], async () => {
      discoveryCalls += 1;
      return ['provider-default'];
    });
    expect(await instance.getOptions()).toEqual(['custom-model', 'gpt-6.1-sol']);
    expect(discoveryCalls).toBe(0);
  });

  test('initial response discovers provider models when no admin list is configured', async () => {
    expect(await controller([], async () => ['provider-default', 'other-model', 'provider-default']).getOptions())
      .toEqual(['provider-default', 'other-model']);
  });

  test('initial response stays available when provider discovery fails', async () => {
    const instance = controller([], async () => { throw new Error('provider unavailable'); });
    expect(await instance.getOptions()).toEqual([]);
  });

  test('initial response supports providers without discovery', async () => {
    expect(await controller([]).getOptions()).toEqual([]);
  });

  test('refreshes from the provider, deduplicating while preserving admin ordering', async () => {
    const instance = controller(['custom-model', 'gpt-6.1-sol'], async () => ['gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-luna']);
    expect(await instance.refreshOptions()).toEqual(['custom-model', 'gpt-6.1-sol', 'gpt-6-luna']);
  });

  test('retains configured options when provider discovery fails', async () => {
    const instance = controller(['custom-model'], async () => { throw new Error('provider unavailable'); });
    expect(await instance.refreshOptions()).toEqual(['custom-model']);
  });

  test('retains configured options for providers without discovery', async () => {
    expect(await controller(['custom-model']).refreshOptions()).toEqual(['custom-model']);
  });

  test('returns discovered options when no admin list is configured', async () => {
    expect(await controller([], async () => ['provider-default']).refreshOptions()).toEqual(['provider-default']);
  });
});
