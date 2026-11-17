import {
  chmodSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** An installation token Git may use, with the organization it belongs to. */
export interface InstallationCredential {
  account: string | null;
  token: string;
}

const GITHUB_CREDENTIAL_KEY = 'credential.https://github.com';

/**
 * Git credential helper for https://github.com. Git passes the repository path
 * (`useHttpPath`), and the helper answers with the installation token of the
 * path's organization, else the first listed token. It reads the tokens file
 * beside it on every call, so a long-running process always gets the current
 * token. It never prints anything for other hosts or operations.
 */
export const GIT_CREDENTIAL_HELPER = `#!/bin/sh
[ "$1" = get ] || exit 0
tokens="$(dirname "$0")/tokens"
protocol= host= path=
while IFS= read -r line; do
  [ -n "$line" ] || break
  case $line in
    protocol=*) protocol=\${line#protocol=} ;;
    host=*) host=\${line#host=} ;;
    path=*) path=\${line#path=} ;;
  esac
done
[ "$protocol" = https ] && [ "$host" = github.com ] && [ -r "$tokens" ] || exit 0
org=$(printf '%s' "\${path%%/*}" | tr '[:upper:]' '[:lower:]')
token= fallback=
while read -r account value; do
  [ -n "$value" ] || continue
  [ -n "$fallback" ] || fallback=$value
  if [ -n "$org" ] && [ "$account" = "$org" ]; then
    token=$value
    break
  fi
done < "$tokens"
token=\${token:-$fallback}
[ -n "$token" ] || exit 0
printf 'username=x-access-token\\npassword=%s\\n' "$token"
`;

const ACCOUNT = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const TOKEN = /^[\x21-\x7e]+$/;

/** A GitHub account login, or null for anything else. */
export function githubAccount(value: unknown): string | null {
  return typeof value === 'string' && ACCOUNT.test(value) ? value : null;
}

/**
 * The private directory holding the credential helper and the current
 * installation tokens (mode 0700, outside the workspace and session volume).
 */
export class GitCredentialStore {
  readonly dir: string;
  readonly helper: string;
  private readonly tokens: string;

  constructor(root = tmpdir()) {
    this.dir = mkdtempSync(join(root, 'fibe-github-'));
    chmodSync(this.dir, 0o700);
    this.helper = join(this.dir, 'git-credential-github');
    this.tokens = join(this.dir, 'tokens');
    this.write([]);
    writeFileSync(this.helper, GIT_CREDENTIAL_HELPER, { mode: 0o700 });
  }

  /** Atomically replaces the tokens the helper answers with, in order. */
  write(credentials: InstallationCredential[]): void {
    const lines = credentials
      .filter(({ token }) => TOKEN.test(token))
      .map(
        ({ account, token }) => `${(account ?? '-').toLowerCase()} ${token}\n`,
      )
      .join('');
    const next = `${this.tokens}.next`;
    writeFileSync(next, lines, { mode: 0o600 });
    renameSync(next, this.tokens);
  }

  remove(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}

/**
 * Adds the helper for https://github.com to the Git configuration every child
 * process inherits (`GIT_CONFIG_COUNT`), after any entries already there, so
 * no file configuration (global or repository) is written. Returns false when
 * an existing `GIT_CONFIG_COUNT` is malformed and is left alone.
 */
export function configureGitCredentialHelper(
  helper: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const current = env.GIT_CONFIG_COUNT?.trim() || '0';
  if (!/^\d+$/.test(current)) return false;
  const count = Number(current);
  const command = `!'${helper.replaceAll("'", `'\\''`)}'`;
  for (let i = 0; i < count; i += 1) {
    if (env[`GIT_CONFIG_VALUE_${i}`] === command) return true;
  }
  const entries: [string, string][] = [
    [`${GITHUB_CREDENTIAL_KEY}.helper`, command],
    [`${GITHUB_CREDENTIAL_KEY}.useHttpPath`, 'true'],
  ];
  entries.forEach(([key, value], offset) => {
    env[`GIT_CONFIG_KEY_${count + offset}`] = key;
    env[`GIT_CONFIG_VALUE_${count + offset}`] = value;
  });
  env.GIT_CONFIG_COUNT = String(count + entries.length);
  return true;
}
