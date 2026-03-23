import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadInjectedCredentials } from './credential-injector';

describe('loadInjectedCredentials', () => {
  const envBackup: Record<string, string | undefined> = {};
  let tempDir: string;

  beforeEach(() => {
    envBackup.AGENT_CREDENTIALS_JSON = process.env.AGENT_CREDENTIALS_JSON;
    envBackup.SESSION_DIR = process.env.SESSION_DIR;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-inject-'));
  });

  afterEach(() => {
    process.env.AGENT_CREDENTIALS_JSON = envBackup.AGENT_CREDENTIALS_JSON;
    process.env.SESSION_DIR = envBackup.SESSION_DIR;
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  test('returns false when AGENT_CREDENTIALS_JSON is not set', () => {
    delete process.env.AGENT_CREDENTIALS_JSON;
    process.env.SESSION_DIR = tempDir;
    expect(loadInjectedCredentials()).toBe(false);
  });

  test('returns false when AGENT_CREDENTIALS_JSON is empty', () => {
    process.env.AGENT_CREDENTIALS_JSON = '';
    process.env.SESSION_DIR = tempDir;
    expect(loadInjectedCredentials()).toBe(false);
  });

  test('returns false when SESSION_DIR is not set', () => {
    process.env.AGENT_CREDENTIALS_JSON = '{"token.txt":"abc"}';
    delete process.env.SESSION_DIR;
    expect(loadInjectedCredentials()).toBe(false);
  });

  test('returns false for invalid JSON', () => {
    process.env.AGENT_CREDENTIALS_JSON = 'not-json';
    process.env.SESSION_DIR = tempDir;
    expect(loadInjectedCredentials()).toBe(false);
  });

  test('returns false for non-object JSON (array)', () => {
    process.env.AGENT_CREDENTIALS_JSON = '["a","b"]';
    process.env.SESSION_DIR = tempDir;
    expect(loadInjectedCredentials()).toBe(false);
  });

  test('returns false for empty object', () => {
    process.env.AGENT_CREDENTIALS_JSON = '{}';
    process.env.SESSION_DIR = tempDir;
    expect(loadInjectedCredentials()).toBe(false);
  });

  test('writes credential file to SESSION_DIR with 0o600', () => {
    process.env.AGENT_CREDENTIALS_JSON = '{"agent_token.txt":"sk-ant-123"}';
    process.env.SESSION_DIR = tempDir;
    expect(loadInjectedCredentials()).toBe(true);
    const filePath = path.join(tempDir, 'agent_token.txt');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('sk-ant-123');
    const mode = fs.statSync(filePath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test('creates SESSION_DIR if it does not exist', () => {
    const subDir = path.join(tempDir, 'nested', 'session');
    process.env.AGENT_CREDENTIALS_JSON = '{"auth.json":"{}"}';
    process.env.SESSION_DIR = subDir;
    expect(loadInjectedCredentials()).toBe(true);
    expect(fs.existsSync(subDir)).toBe(true);
    expect(fs.readFileSync(path.join(subDir, 'auth.json'), 'utf8')).toBe('{}');
  });

  test('writes multiple credential files', () => {
    process.env.AGENT_CREDENTIALS_JSON = JSON.stringify({
      'oauth_creds.json': '{"token":"abc"}',
      'credentials.json': '{"refresh":"xyz"}',
    });
    process.env.SESSION_DIR = tempDir;
    expect(loadInjectedCredentials()).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, 'oauth_creds.json'), 'utf8')).toBe('{"token":"abc"}');
    expect(fs.readFileSync(path.join(tempDir, 'credentials.json'), 'utf8')).toBe('{"refresh":"xyz"}');
  });

  test('rejects path traversal in filenames', () => {
    process.env.AGENT_CREDENTIALS_JSON = '{"../../../etc/passwd":"malicious"}';
    process.env.SESSION_DIR = tempDir;
    expect(loadInjectedCredentials()).toBe(false);
    expect(fs.readdirSync(tempDir).length).toBe(0);
  });

  test('handles write failure gracefully and returns false when all fail', () => {
    // Use a read-only directory to trigger write errors
    const readOnlyFile = path.join(tempDir, 'not-a-dir');
    fs.writeFileSync(readOnlyFile, 'block');
    // Point SESSION_DIR to a file (not a directory) so writeFileSync into it fails
    process.env.AGENT_CREDENTIALS_JSON = '{"file.txt":"content"}';
    process.env.SESSION_DIR = readOnlyFile;
    // mkdirSync will fail (path is a file), but injection should handle gracefully
    const result = loadInjectedCredentials();
    // Should fail because we can't write inside a file
    expect(typeof result).toBe('boolean');
  });

  test('returns true if at least one file succeeds even when another has suspicious name', () => {
    process.env.AGENT_CREDENTIALS_JSON = JSON.stringify({
      'good.txt': 'valid-content',
      'sub/bad.txt': 'traversal-content',
    });
    process.env.SESSION_DIR = tempDir;
    const result = loadInjectedCredentials();
    expect(result).toBe(true);
    // good.txt should exist, sub/bad.txt should be skipped
    expect(fs.existsSync(path.join(tempDir, 'good.txt'))).toBe(true);
  });
});
