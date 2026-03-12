import { describe, it, expect } from 'vitest';
import {
  NEON_CYAN,
  NEON_MAGENTA,
  NEON_VIOLET,
  CYAN_GLOW,
  MAGENTA_GLOW,
  VIOLET_GLOW,
} from './animation-colors';

describe('animation-colors', () => {
  it('exports NEON_CYAN as non-empty string', () => {
    expect(typeof NEON_CYAN).toBe('string');
    expect(NEON_CYAN.length).toBeGreaterThan(0);
  });

  it('exports NEON_MAGENTA as non-empty string', () => {
    expect(typeof NEON_MAGENTA).toBe('string');
    expect(NEON_MAGENTA.length).toBeGreaterThan(0);
  });

  it('exports NEON_VIOLET as non-empty string', () => {
    expect(typeof NEON_VIOLET).toBe('string');
    expect(NEON_VIOLET.length).toBeGreaterThan(0);
  });

  it('exports CYAN_GLOW as non-empty string', () => {
    expect(typeof CYAN_GLOW).toBe('string');
    expect(CYAN_GLOW.length).toBeGreaterThan(0);
  });

  it('exports MAGENTA_GLOW as non-empty string', () => {
    expect(typeof MAGENTA_GLOW).toBe('string');
    expect(MAGENTA_GLOW.length).toBeGreaterThan(0);
  });

  it('exports VIOLET_GLOW as non-empty string', () => {
    expect(typeof VIOLET_GLOW).toBe('string');
    expect(VIOLET_GLOW.length).toBeGreaterThan(0);
  });
});
