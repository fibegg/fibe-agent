/** Preserves a complete in-memory localStorage across Vitest global resets. */
import { vi } from 'vitest';

const _store: Record<string, string> = {};

const storage: Storage = {
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(_store, key)
      ? _store[key]
      : null;
  },
  setItem(key: string, value: string): void {
    _store[key] = String(value);
  },
  removeItem(key: string): void {
    delete _store[key];
  },
  clear(): void {
    for (const key of Object.keys(_store)) delete _store[key];
  },
  key(index: number): string | null {
    return Object.keys(_store)[index] ?? null;
  },
  get length(): number {
    return Object.keys(_store).length;
  },
};

vi.stubGlobal('localStorage', storage);

const _unstubAllGlobals = vi.unstubAllGlobals.bind(vi);
vi.unstubAllGlobals = () => {
  const result = _unstubAllGlobals();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal(
    'Worker',
    class MockWorker {
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
      postMessage = vi.fn();
      terminate = vi.fn();
    },
  );
  return result;
};

vi.stubGlobal(
  'Worker',
  class MockWorker {
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
    postMessage = vi.fn();
    terminate = vi.fn();
  },
);
