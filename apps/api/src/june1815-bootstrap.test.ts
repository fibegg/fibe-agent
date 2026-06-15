import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureJune1815Bootstrap } from './june1815-bootstrap';

const TEST_TMP = join(tmpdir(), `june1815-bootstrap-test-${process.pid}`);

function makeExecutable(path: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  chmodSync(path, 0o755);
}

describe('ensureJune1815Bootstrap', () => {
  beforeEach(() => {
    rmSync(TEST_TMP, { recursive: true, force: true });
    mkdirSync(TEST_TMP, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_TMP, { recursive: true, force: true });
  });

  test('skips when JUNE1815_ENABLED is not set', () => {
    let installed = false;

    const result = ensureJune1815Bootstrap({
      env: {},
      install: () => {
        installed = true;
      },
    });

    expect(result).toEqual({ enabled: false, installed: false });
    expect(installed).toBe(false);
  });

  test('installs from JUNE1815_PACKAGE_PATH when CLAUDE_PATH is missing', () => {
    const prefix = join(TEST_TMP, 'npm-global');
    const june1815 = join(prefix, 'bin', 'june1815');
    const realClaude = join(TEST_TMP, 'real-claude');
    const packagePath = join(TEST_TMP, 'june1815.tgz');
    writeFileSync(packagePath, 'pkg');
    makeExecutable(realClaude);

    const result = ensureJune1815Bootstrap({
      env: {
        HOME: TEST_TMP,
        JUNE1815_ENABLED: '1',
        CLAUDE_PATH: june1815,
        JUNE1815_CLAUDE_PATH: realClaude,
        JUNE1815_PACKAGE_PATH: packagePath,
        NPM_CONFIG_PREFIX: prefix,
      },
      install: (_packagePath, installPrefix) => {
        expect(_packagePath).toBe(packagePath);
        expect(installPrefix).toBe(prefix);
        makeExecutable(june1815);
      },
    });

    expect(result).toEqual({
      enabled: true,
      installed: true,
      claudeOnboardingSeeded: true,
      claudeSettingsSeeded: true,
      claudePath: june1815,
      wrappedClaudePath: realClaude,
    });
    expect(JSON.parse(readFileSync(join(TEST_TMP, '.claude.json'), 'utf8'))).toEqual({
      hasCompletedOnboarding: true,
    });
    expect(JSON.parse(readFileSync(join(TEST_TMP, '.claude', 'settings.json'), 'utf8'))).toEqual({
      skipDangerousModePermissionPrompt: true,
    });
  });

  test('preserves existing Claude global config while seeding onboarding completion', () => {
    const home = join(TEST_TMP, 'home');
    const june1815 = join(TEST_TMP, 'bin', 'june1815');
    const realClaude = join(TEST_TMP, 'real-claude');
    mkdirSync(home, { recursive: true });
    writeFileSync(
      join(home, '.claude.json'),
      `${JSON.stringify({ userID: 'abc123', theme: 'light' }, null, 2)}\n`,
    );
    makeExecutable(june1815);
    makeExecutable(realClaude);

    const result = ensureJune1815Bootstrap({
      env: {
        HOME: home,
        JUNE1815_ENABLED: '1',
        CLAUDE_PATH: june1815,
        JUNE1815_CLAUDE_PATH: realClaude,
      },
    });

    expect(result.claudeOnboardingSeeded).toBe(true);
    expect(JSON.parse(readFileSync(join(home, '.claude.json'), 'utf8'))).toEqual({
      userID: 'abc123',
      theme: 'light',
      hasCompletedOnboarding: true,
    });
  });

  test('preserves existing Claude settings while seeding dangerous-mode prompt skip', () => {
    const home = join(TEST_TMP, 'home');
    const june1815 = join(TEST_TMP, 'bin', 'june1815');
    const realClaude = join(TEST_TMP, 'real-claude');
    const settingsDir = join(home, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, 'settings.json'),
      `${JSON.stringify({ theme: 'dark', mcpServers: { fibe: {} } }, null, 2)}\n`,
    );
    makeExecutable(june1815);
    makeExecutable(realClaude);

    const result = ensureJune1815Bootstrap({
      env: {
        HOME: home,
        JUNE1815_ENABLED: '1',
        CLAUDE_PATH: june1815,
        JUNE1815_CLAUDE_PATH: realClaude,
      },
    });

    expect(result.claudeSettingsSeeded).toBe(true);
    expect(JSON.parse(readFileSync(join(settingsDir, 'settings.json'), 'utf8'))).toEqual({
      theme: 'dark',
      mcpServers: { fibe: {} },
      skipDangerousModePermissionPrompt: true,
    });
  });

  test('seeds Claude settings in SESSION_DIR when present', () => {
    const home = join(TEST_TMP, 'home');
    const sessionDir = join(TEST_TMP, 'session-claude');
    const june1815 = join(TEST_TMP, 'bin', 'june1815');
    const realClaude = join(TEST_TMP, 'real-claude');
    makeExecutable(june1815);
    makeExecutable(realClaude);

    ensureJune1815Bootstrap({
      env: {
        HOME: home,
        SESSION_DIR: sessionDir,
        JUNE1815_ENABLED: '1',
        CLAUDE_PATH: june1815,
        JUNE1815_CLAUDE_PATH: realClaude,
      },
    });

    expect(JSON.parse(readFileSync(join(sessionDir, 'settings.json'), 'utf8'))).toEqual({
      skipDangerousModePermissionPrompt: true,
    });
  });

  test('does not rewrite Claude global config when onboarding is already completed', () => {
    const home = join(TEST_TMP, 'home');
    const june1815 = join(TEST_TMP, 'bin', 'june1815');
    const realClaude = join(TEST_TMP, 'real-claude');
    const configPath = join(home, '.claude.json');
    mkdirSync(home, { recursive: true });
    writeFileSync(
      configPath,
      `${JSON.stringify({ hasCompletedOnboarding: true, userID: 'abc123' }, null, 2)}\n`,
    );
    const settingsPath = join(home, '.claude', 'settings.json');
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(
      settingsPath,
      `${JSON.stringify({ skipDangerousModePermissionPrompt: true }, null, 2)}\n`,
    );
    const before = readFileSync(configPath, 'utf8');
    const settingsBefore = readFileSync(settingsPath, 'utf8');
    makeExecutable(june1815);
    makeExecutable(realClaude);

    const result = ensureJune1815Bootstrap({
      env: {
        HOME: home,
        JUNE1815_ENABLED: '1',
        CLAUDE_PATH: june1815,
        JUNE1815_CLAUDE_PATH: realClaude,
      },
    });

    expect(result.claudeOnboardingSeeded).toBe(false);
    expect(result.claudeSettingsSeeded).toBe(false);
    expect(readFileSync(configPath, 'utf8')).toBe(before);
    expect(readFileSync(settingsPath, 'utf8')).toBe(settingsBefore);
  });

  test('fails when enabled and CLAUDE_PATH is not executable', () => {
    const june1815 = join(TEST_TMP, 'bin', 'june1815');
    const realClaude = join(TEST_TMP, 'real-claude');
    mkdirSync(join(TEST_TMP, 'bin'), { recursive: true });
    writeFileSync(june1815, '#!/bin/sh\nexit 0\n', { mode: 0o644 });
    makeExecutable(realClaude);

    expect(() =>
      ensureJune1815Bootstrap({
        env: {
          JUNE1815_ENABLED: '1',
          CLAUDE_PATH: june1815,
          JUNE1815_CLAUDE_PATH: realClaude,
        },
      }),
    ).toThrow('CLAUDE_PATH is not executable');
  });

  test('fails when enabled and wrapped real Claude is missing', () => {
    const june1815 = join(TEST_TMP, 'bin', 'june1815');
    makeExecutable(june1815);

    expect(() =>
      ensureJune1815Bootstrap({
        env: {
          JUNE1815_ENABLED: '1',
          CLAUDE_PATH: june1815,
          JUNE1815_CLAUDE_PATH: join(TEST_TMP, 'missing-claude'),
        },
      }),
    ).toThrow('JUNE1815_CLAUDE_PATH does not exist');
  });

  test('fails when install is required but package path is missing', () => {
    expect(() =>
      ensureJune1815Bootstrap({
        env: {
          JUNE1815_ENABLED: '1',
          CLAUDE_PATH: join(TEST_TMP, 'npm-global', 'bin', 'june1815'),
          JUNE1815_CLAUDE_PATH: join(TEST_TMP, 'real-claude'),
        },
      }),
    ).toThrow('JUNE1815_PACKAGE_PATH is required');
  });
});
