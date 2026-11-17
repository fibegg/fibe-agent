import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

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

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

/**
 * `gh` wrapper for Agent processes while several installations are held. It
 * names the organization from `-R/--repo`, else `GH_REPO`, else the current
 * directory's `origin` remote (github.com only), and runs the real `gh` with
 * that organization's current token (else the first held one) as GH_TOKEN. It
 * reads the tokens file on every call, never prints a token, and execs the
 * real `gh` (resolved when the wrapper is written) so arguments and the exit
 * code pass through. Without a usable token it execs the real `gh` untouched.
 */
export function ghWrapperScript(realGh: string, tokensFile: string): string {
  return `#!/bin/sh
real=${shellQuote(realGh)}
tokens=${shellQuote(tokensFile)}
# org_of SPEC: the lower-cased GitHub organization of a repository spec or remote URL.
org_of() {
  s=$1
  case $s in
    *://*) s=\${s#*://}; s=\${s#*@}; host=\${s%%/*}; s=\${s#*/} ;;
    *@*:*) s=\${s#*@}; host=\${s%%:*}; s=\${s#*:} ;;
    github.com:*) host=github.com; s=\${s#*:} ;;
    */*/*) host=\${s%%/*}; s=\${s#*/} ;;
    *) host=github.com ;;
  esac
  host=\${host%%:*}
  [ "$host" = github.com ] || return 1
  s=\${s#/}
  o=\${s%%/*}
  case $o in '' | *[!A-Za-z0-9-]*) return 1 ;; esac
  printf '%s' "$o" | tr '[:upper:]' '[:lower:]'
}
if [ -r "$tokens" ]; then
  spec=
  want=
  for arg in "$@"; do
    if [ -n "$want" ]; then spec=$arg; break; fi
    case $arg in
      --) break ;;
      -R | --repo) want=1 ;;
      --repo=*) spec=\${arg#--repo=}; break ;;
      -R?*) spec=\${arg#-R}; spec=\${spec#=}; break ;;
    esac
  done
  [ -n "$spec" ] || spec=\${GH_REPO-}
  org=
  if [ -n "$spec" ]; then
    org=$(org_of "$spec") || org=
  else
    remote=$(git remote get-url origin 2>/dev/null) && org=$(org_of "$remote") || org=
  fi
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
  if [ -n "$token" ]; then
    GH_TOKEN=$token
    export GH_TOKEN
  fi
fi
exec "$real" "$@"
`;
}

/** The executable called `name` on PATH, skipping `skipDir`; null if none. */
export function findExecutable(
  name: string,
  path: string,
  skipDir?: string,
): string | null {
  for (const dir of path.split(delimiter)) {
    if (!dir || !dir.startsWith('/') || dir === skipDir) continue;
    const candidate = join(dir, name);
    try {
      const stat = statSync(candidate);
      if (stat.isFile() && (stat.mode & 0o111) !== 0) return candidate;
    } catch {
      // Not in this directory.
    }
  }
  return null;
}

/** Name of the variable that tells PATH builders where the `gh` wrapper is. */
export const GH_WRAPPER_DIR_ENV = 'FIBE_GH_WRAPPER_DIR';

/** PATH with the `gh` wrapper directory (when installed) ahead of everything. */
export function withGhWrapper(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const dir = env[GH_WRAPPER_DIR_ENV];
  if (!dir) return path;
  return [dir, ...path.split(delimiter).filter((entry) => entry !== dir)]
    .filter(Boolean)
    .join(delimiter);
}

/**
 * The lower-cased organization of a GitHub repository given as `owner/name`,
 * `github.com/owner/name`, or an https/ssh remote URL; null for other hosts.
 */
export function githubOrganization(spec: unknown): string | null {
  if (typeof spec !== 'string') return null;
  let s = spec.trim();
  let host = 'github.com';
  if (s.includes('://')) {
    s = s.slice(s.indexOf('://') + 3);
    s = s.slice(s.indexOf('@') + 1);
    host = s.split('/')[0];
    s = s.slice(s.indexOf('/') + 1);
  } else if (/^[^/@]*@[^/:]*:/.test(s) || /^github\.com:/.test(s)) {
    s = s.slice(s.indexOf('@') + 1);
    host = s.split(':')[0];
    s = s.slice(s.indexOf(':') + 1);
  } else if (s.split('/').length >= 3) {
    host = s.split('/')[0];
    s = s.slice(s.indexOf('/') + 1);
  }
  if (host.split(':')[0].toLowerCase() !== 'github.com') return null;
  const org = s.replace(/^\/+/, '').split('/')[0];
  return /^[A-Za-z0-9-]+$/.test(org) ? org.toLowerCase() : null;
}

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

  /**
   * Writes the `gh` wrapper beside the helper and returns its directory, or
   * null when no real `gh` is on `path` (resolved here, once, so the wrapper
   * can never find itself).
   */
  installGhWrapper(path: string): string | null {
    const binDir = join(this.dir, 'bin');
    const realGh = findExecutable('gh', path, binDir);
    if (!realGh) return null;
    mkdirSync(binDir, { mode: 0o700 });
    writeFileSync(join(binDir, 'gh'), ghWrapperScript(realGh, this.tokens), {
      mode: 0o700,
    });
    return binDir;
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
