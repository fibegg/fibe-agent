import { describe, test, expect } from 'bun:test';
import { encryptData, decryptData } from './crypto.util';

describe('crypto.util', () => {
  const testKey = 'my-secret-encryption-key-12345';

  describe('encryptData', () => {
    test('returns plain text when no key provided', () => {
      expect(encryptData('hello')).toBe('hello');
    });

    test('returns plain text when key is undefined', () => {
      expect(encryptData('hello', undefined)).toBe('hello');
    });

    test('returns ENC: prefixed string when key is provided', () => {
      const encrypted = encryptData('hello', testKey);
      expect(encrypted.startsWith('ENC:')).toBe(true);
    });

    test('produces different ciphertext each time (random IV)', () => {
      const a = encryptData('hello', testKey);
      const b = encryptData('hello', testKey);
      expect(a).not.toBe(b);
    });

    test('encrypted string has 4 colon-separated parts', () => {
      const encrypted = encryptData('hello', testKey);
      expect(encrypted.split(':').length).toBe(4);
    });
  });

  describe('decryptData', () => {
    test('returns plain text when input is not ENC: prefixed', () => {
      expect(decryptData('hello')).toBe('hello');
    });

    test('decrypts text encrypted with same key', () => {
      const encrypted = encryptData('secret message', testKey);
      const decrypted = decryptData(encrypted, testKey);
      expect(decrypted).toBe('secret message');
    });

    test('throws when key is missing but data is encrypted', () => {
      const encrypted = encryptData('hello', testKey);
      expect(() => decryptData(encrypted)).toThrow('Missing ENCRYPTION_KEY');
    });

    test('throws when wrong key is used', () => {
      const encrypted = encryptData('hello', testKey);
      expect(() => decryptData(encrypted, 'wrong-key')).toThrow();
    });

    test('throws on invalid encrypted format', () => {
      expect(() => decryptData('ENC:only:two', testKey)).toThrow('Invalid encrypted format');
    });

    test('handles empty string', () => {
      const encrypted = encryptData('', testKey);
      const decrypted = decryptData(encrypted, testKey);
      expect(decrypted).toBe('');
    });

    test('handles unicode text', () => {
      const text = 'Hello 世界 🌍';
      const encrypted = encryptData(text, testKey);
      const decrypted = decryptData(encrypted, testKey);
      expect(decrypted).toBe(text);
    });

    test('handles key shorter than 32 chars (padded)', () => {
      const shortKey = 'short';
      const encrypted = encryptData('data', shortKey);
      const decrypted = decryptData(encrypted, shortKey);
      expect(decrypted).toBe('data');
    });

    test('handles key longer than 32 chars (truncated)', () => {
      const longKey = 'a'.repeat(64);
      const encrypted = encryptData('data', longKey);
      const decrypted = decryptData(encrypted, longKey);
      expect(decrypted).toBe('data');
    });

    test('encrypted output does not contain the plaintext', () => {
      const sensitive = 'my-super-secret-api-key-12345';
      const encrypted = encryptData(sensitive, testKey);
      expect(encrypted).not.toContain(sensitive);
    });

    test('encrypted output does not contain the key material', () => {
      const encrypted = encryptData('hello', testKey);
      expect(encrypted).not.toContain(testKey);
    });

    test('decryption with tampered ciphertext fails', () => {
      const encrypted = encryptData('hello', testKey);
      const parts = encrypted.split(':');
      parts[3] = Buffer.from('tampered').toString('base64');
      const tampered = parts.join(':');
      expect(() => decryptData(tampered, testKey)).toThrow();
    });

    test('decryption with tampered auth tag fails', () => {
      const encrypted = encryptData('hello', testKey);
      const parts = encrypted.split(':');
      parts[2] = Buffer.from('0'.repeat(16)).toString('base64');
      const tampered = parts.join(':');
      expect(() => decryptData(tampered, testKey)).toThrow();
    });
  });
});
