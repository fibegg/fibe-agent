/**
 * Vitest global setup — provides a working localStorage for JSDOM tests.
 *
 * Problem: vi.unstubAllGlobals() removes JSDOM's localStorage, leaving
 * Node ≥22's broken built-in (missing .clear/.setItem/.removeItem).
 *
 * Solution: Install a compliant in-memory Storage and patch
 * vi.unstubAllGlobals to preserve it.
 */
import { vi } from 'vitest';

const _store: Record<string, string> = {};

const storage: Storage = {
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(_store, key) ? _store[key] : null;
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

// Install our localStorage
vi.stubGlobal('localStorage', storage);

// Wrap vi.unstubAllGlobals so it always restores our working localStorage after
const _unstubAllGlobals = vi.unstubAllGlobals.bind(vi);
vi.unstubAllGlobals = () => {
  const result = _unstubAllGlobals();
  // Re-apply our working localStorage after Vitest nukes everything
  vi.stubGlobal('localStorage', storage);
  return result;
};
