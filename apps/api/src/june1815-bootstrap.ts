import { execFileSync } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { containerLog } from './container-logger';

const CONTEXT = 'June1815';

export interface June1815BootstrapResult {
  enabled: boolean;
  installed: boolean;
  claudeOnboardingSeeded?: boolean;
  claudeSettingsSeeded?: boolean;
  claudePath?: string;
  wrappedClaudePath?: string;
}

interface BootstrapDeps {
  env?: NodeJS.ProcessEnv;
  install?: (packagePath: string, prefix: string, env: NodeJS.ProcessEnv) => void;
}

function truthy(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function requirePath(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required when JUNE1815_ENABLED=1`);
  return value;
}

function installPrefix(env: NodeJS.ProcessEnv, claudePath: string): string {
  return env.NPM_CONFIG_PREFIX?.trim() || dirname(dirname(claudePath));
}

function installWithNpm(packagePath: string, prefix: string, env: NodeJS.ProcessEnv): void {
  execFileSync('npm', ['install', '-g', packagePath], {
    env: { ...env, NPM_CONFIG_PREFIX: prefix },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function claudeHomeDir(env: NodeJS.ProcessEnv): string {
  const home = env.HOME?.trim();
  if (home) return home;
  const sessionDir = env.SESSION_DIR?.trim();
  if (sessionDir) return dirname(sessionDir);
  return '/home/node';
}

function claudeGlobalConfigPath(env: NodeJS.ProcessEnv): string {
  return join(claudeHomeDir(env), '.claude.json');
}

function claudeSettingsPath(env: NodeJS.ProcessEnv): string {
  const sessionDir = env.SESSION_DIR?.trim();
  const settingsDir = sessionDir || join(claudeHomeDir(env), '.claude');
  return join(settingsDir, 'settings.json');
}

function readClaudeGlobalConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8').trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Claude global config is not a JSON object: ${path}`);
  }
  return parsed as Record<string, unknown>;
}

function readClaudeSettings(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8').trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Claude settings file is not a JSON object: ${path}`);
  }
  return parsed as Record<string, unknown>;
}

function ensureClaudeOnboardingCompleted(env: NodeJS.ProcessEnv): boolean {
  const configPath = claudeGlobalConfigPath(env);
  const current = readClaudeGlobalConfig(configPath);
  if (current.hasCompletedOnboarding === true) return false;

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    `${JSON.stringify({ ...current, hasCompletedOnboarding: true }, null, 2)}\n`,
    { mode: 0o600 },
  );
  return true;
}

function ensureClaudeDangerousModePromptSkipped(env: NodeJS.ProcessEnv): boolean {
  const settingsPath = claudeSettingsPath(env);
  const current = readClaudeSettings(settingsPath);
  if (current.skipDangerousModePermissionPrompt === true) return false;

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(
    settingsPath,
    `${JSON.stringify({ ...current, skipDangerousModePermissionPrompt: true }, null, 2)}\n`,
    { mode: 0o600 },
  );
  return true;
}

function assertExecutable(path: string, label: string): void {
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`);
  if (!executable(path)) throw new Error(`${label} is not executable: ${path}`);
}

export function ensureJune1815Bootstrap(deps: BootstrapDeps = {}): June1815BootstrapResult {
  const env = deps.env ?? process.env;
  if (!truthy(env.JUNE1815_ENABLED)) return { enabled: false, installed: false };

  const claudePath = requirePath(env, 'CLAUDE_PATH');
  const wrappedClaudePath = requirePath(env, 'JUNE1815_CLAUDE_PATH');
  let installed = false;

  if (!existsSync(claudePath)) {
    const packagePath = requirePath(env, 'JUNE1815_PACKAGE_PATH');
    if (!existsSync(packagePath)) {
      throw new Error(`JUNE1815_PACKAGE_PATH does not exist: ${packagePath}`);
    }

    const prefix = installPrefix(env, claudePath);
    containerLog.log(`Installing june1815 from ${packagePath} into ${prefix}`, CONTEXT);
    (deps.install ?? installWithNpm)(packagePath, prefix, env);
    installed = true;
  }

  assertExecutable(claudePath, 'CLAUDE_PATH');
  assertExecutable(wrappedClaudePath, 'JUNE1815_CLAUDE_PATH');
  const claudeOnboardingSeeded = ensureClaudeOnboardingCompleted(env);
  const claudeSettingsSeeded = ensureClaudeDangerousModePromptSkipped(env);
  if (claudeOnboardingSeeded) {
    containerLog.log(
      `Seeded Claude first-run onboarding state in ${claudeGlobalConfigPath(env)}`,
      CONTEXT,
    );
  }
  if (claudeSettingsSeeded) {
    containerLog.log(
      `Seeded Claude dangerous-mode prompt setting in ${claudeSettingsPath(env)}`,
      CONTEXT,
    );
  }
  containerLog.log(`Using june1815 executable: ${claudePath}`, CONTEXT);
  return {
    enabled: true,
    installed,
    claudeOnboardingSeeded,
    claudeSettingsSeeded,
    claudePath,
    wrappedClaudePath,
  };
}
