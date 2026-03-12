import { describe, test, expect } from 'bun:test';
import { getCorsOrigin, getFrameAncestors } from './cors-frame.config';

describe('getCorsOrigin', () => {
  test('returns true when CORS_ORIGINS is unset', () => {
    expect(getCorsOrigin({})).toBe(true);
  });

  test('returns true when CORS_ORIGINS is empty string', () => {
    expect(getCorsOrigin({ CORS_ORIGINS: '' })).toBe(true);
  });

  test('returns true when CORS_ORIGINS is whitespace only', () => {
    expect(getCorsOrigin({ CORS_ORIGINS: '   ' })).toBe(true);
  });

  test('returns true when CORS_ORIGINS is *', () => {
    expect(getCorsOrigin({ CORS_ORIGINS: '*' })).toBe(true);
  });

  test('returns list of origins when CORS_ORIGINS is comma-separated', () => {
    expect(getCorsOrigin({ CORS_ORIGINS: 'https://a.com, https://b.com' })).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  test('trims and filters empty segments', () => {
    expect(getCorsOrigin({ CORS_ORIGINS: '  a , , b ,' })).toEqual(['a', 'b']);
  });

  test('returns default origins when CORS_ORIGINS parses to empty list', () => {
    expect(getCorsOrigin({ CORS_ORIGINS: ', ,' })).toEqual([
      'http://localhost:3100',
      'http://localhost:4300',
    ]);
  });
});

describe('getFrameAncestors', () => {
  test('returns [*] when FRAME_ANCESTORS is unset', () => {
    expect(getFrameAncestors({})).toEqual(['*']);
  });

  test('returns [*] when FRAME_ANCESTORS is empty string', () => {
    expect(getFrameAncestors({ FRAME_ANCESTORS: '' })).toEqual(['*']);
  });

  test('returns [*] when FRAME_ANCESTORS is whitespace only', () => {
    expect(getFrameAncestors({ FRAME_ANCESTORS: '   ' })).toEqual(['*']);
  });

  test('returns list when FRAME_ANCESTORS is comma-separated', () => {
    expect(
      getFrameAncestors({ FRAME_ANCESTORS: 'https://parent.com, https://other.com' })
    ).toEqual(['https://parent.com', 'https://other.com']);
  });

  test('trims and filters empty segments', () => {
    expect(getFrameAncestors({ FRAME_ANCESTORS: '  x , , y ,' })).toEqual(['x', 'y']);
  });

  test('returns [*] when FRAME_ANCESTORS parses to empty list', () => {
    expect(getFrameAncestors({ FRAME_ANCESTORS: ', ,' })).toEqual(['*']);
  });
});
