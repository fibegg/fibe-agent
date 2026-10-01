import { describe, test, expect } from 'bun:test';
import { ModelOptionsController } from './model-options.controller';

function controller(envModels: string[], listModels?: () => Promise<string[]>) {
  return new ModelOptionsController(
    { getModelOptions: () => envModels } as never,
    { resolveStrategy: () => ({ listModels }) } as never,
  );
}

describe('ModelOptionsController', () => {
  test('keeps configured model ordering in the initial response', () => {
    expect(controller(['custom-model', 'gpt-6.1-sol']).getOptions()).toEqual(['custom-model', 'gpt-6.1-sol']);
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
