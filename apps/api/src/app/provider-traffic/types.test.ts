import { describe, test, expect } from 'bun:test';
import { resolveProvider, sanitizeHeaders, INTERCEPTED_DOMAINS } from './types';

describe('types', () => {
  describe('resolveProvider', () => {
    test('resolves known provider domains', () => {
      expect(resolveProvider('api.anthropic.com')).toBe('anthropic');
      expect(resolveProvider('api.openai.com')).toBe('openai');
      expect(resolveProvider('generativelanguage.googleapis.com')).toBe('google');
      expect(resolveProvider('openrouter.ai')).toBe('openrouter');
    });

    test('returns unknown for unrecognized domains', () => {
      expect(resolveProvider('example.com')).toBe('unknown');
      expect(resolveProvider('localhost')).toBe('unknown');
    });
  });

  describe('sanitizeHeaders', () => {
    test('redacts sensitive headers', () => {
      const headers = {
        'content-type': 'application/json',
        authorization: 'Bearer sk-abc123',
        'x-api-key': 'secret-key',
        'api-key': 'another-secret',
        'x-goog-api-key': 'goog-key',
        'x-request-id': 'req-123',
      };

      const sanitized = sanitizeHeaders(headers);
      expect(sanitized['content-type']).toBe('application/json');
      expect(sanitized['authorization']).toBe('[REDACTED]');
      expect(sanitized['x-api-key']).toBe('[REDACTED]');
      expect(sanitized['api-key']).toBe('[REDACTED]');
      expect(sanitized['x-goog-api-key']).toBe('[REDACTED]');
      expect(sanitized['x-request-id']).toBe('req-123');
    });

    test('handles mixed-case header names', () => {
      const headers = { Authorization: 'Bearer token' };
      // Keys are compared lowercase
      const sanitized = sanitizeHeaders(headers);
      // Capital A stays as-is, but value is redacted because lowercase match
      expect(sanitized['Authorization']).toBe('[REDACTED]');
    });

    test('returns empty object for empty input', () => {
      expect(sanitizeHeaders({})).toEqual({});
    });
  });

  describe('INTERCEPTED_DOMAINS', () => {
    test('contains all known provider domains', () => {
      expect(INTERCEPTED_DOMAINS.has('api.anthropic.com')).toBe(true);
      expect(INTERCEPTED_DOMAINS.has('api.openai.com')).toBe(true);
      expect(INTERCEPTED_DOMAINS.has('generativelanguage.googleapis.com')).toBe(true);
      expect(INTERCEPTED_DOMAINS.has('openrouter.ai')).toBe(true);
    });

    test('does not contain unknown domains', () => {
      expect(INTERCEPTED_DOMAINS.has('example.com')).toBe(false);
    });
  });
});
