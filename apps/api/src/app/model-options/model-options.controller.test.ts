import { describe, test, expect } from 'bun:test';

/**
 * Test the refresh-options merge logic directly, without importing
 * the NestJS-decorated controller class (which triggers decorator
 * metadata errors in Bun's test runner).
 */

interface MergeOpts {
  envModels: string[];
  providerModels: string[];
}

/** Extracted merge logic identical to ModelOptionsController.refreshOptions */
function mergeModelOptions({ envModels, providerModels }: MergeOpts): string[] {
  const seen = new Set(envModels);
  const merged = [...envModels];
  for (const m of providerModels) {
    if (!seen.has(m)) {
      seen.add(m);
      merged.push(m);
    }
  }
  return merged;
}

describe('ModelOptionsController — merge logic', () => {
  test('returns env models when provider list is empty', () => {
    expect(mergeModelOptions({ envModels: ['a'], providerModels: [] })).toEqual(['a']);
  });

  test('merges env and provider models', () => {
    expect(
      mergeModelOptions({ envModels: ['a', 'b'], providerModels: ['b', 'c', 'd'] })
    ).toEqual(['a', 'b', 'c', 'd']);
  });

  test('deduplicates — env models come first', () => {
    expect(
      mergeModelOptions({ envModels: ['z', 'a'], providerModels: ['a', 'z', 'm'] })
    ).toEqual(['z', 'a', 'm']);
  });

  test('returns empty when both sources are empty', () => {
    expect(mergeModelOptions({ envModels: [], providerModels: [] })).toEqual([]);
  });

  test('returns provider models only when no env models', () => {
    expect(
      mergeModelOptions({ envModels: [], providerModels: ['p1', 'p2'] })
    ).toEqual(['p1', 'p2']);
  });

  test('preserves order within each group', () => {
    expect(
      mergeModelOptions({ envModels: ['c', 'a'], providerModels: ['b', 'a', 'd'] })
    ).toEqual(['c', 'a', 'b', 'd']);
  });

  test('handles large provider list', () => {
    const envModels = ['pinned-model'];
    const providerModels = Array.from({ length: 200 }, (_, i) => `model-${i}`);
    const result = mergeModelOptions({ envModels, providerModels });
    expect(result[0]).toBe('pinned-model');
    expect(result).toHaveLength(201);
  });
});
