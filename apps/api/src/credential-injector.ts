import * as fs from 'node:fs';
import * as path from 'node:path';
import { containerLog } from './container-logger';

const CREDENTIALS_CONTEXT = 'Credentials';

/**
 * Loads pre-authenticated credentials from AGENT_CREDENTIALS_JSON.
 * Used when Fibe attaches a stored Agent to a Playground.
 * Writes files into SESSION_DIR (e.g. agent_token.txt, oauth_creds.json).
 * No-op if env vars are unset or empty.
 */
export function loadInjectedCredentials(): boolean {
  const raw = process.env.AGENT_CREDENTIALS_JSON;
  if (!raw?.trim()) {
    return false;
  }

  const sessionDir = process.env.SESSION_DIR;
  if (!sessionDir) {
    containerLog.warn(
      'AGENT_CREDENTIALS_JSON is set but SESSION_DIR is not. Skipping injection.',
      CREDENTIALS_CONTEXT
    );
    return false;
  }

  let credentialFiles: Record<string, string>;
  try {
    credentialFiles = JSON.parse(raw) as Record<string, string>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    containerLog.error(`Failed to parse AGENT_CREDENTIALS_JSON: ${message}`, CREDENTIALS_CONTEXT);
    return false;
  }

  if (
    !credentialFiles ||
    typeof credentialFiles !== 'object' ||
    Array.isArray(credentialFiles)
  ) {
    containerLog.error(
      'AGENT_CREDENTIALS_JSON must be a JSON object { filename: content }',
      CREDENTIALS_CONTEXT
    );
    return false;
  }

  const entries = Object.entries(credentialFiles);
  if (entries.length === 0) {
    containerLog.warn('AGENT_CREDENTIALS_JSON is empty object. Skipping.', CREDENTIALS_CONTEXT);
    return false;
  }

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
    containerLog.log(`Created session directory: ${sessionDir}`, CREDENTIALS_CONTEXT);
  }

  let injectedCount = 0;
  for (const [filename, content] of entries) {
    const safeName = path.basename(filename);
    if (safeName !== filename) {
      containerLog.warn(`Skipping suspicious filename: ${filename}`, CREDENTIALS_CONTEXT);
      continue;
    }
    try {
      fs.writeFileSync(path.join(sessionDir, safeName), content, { mode: 0o600 });
      injectedCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      containerLog.error(
        `Failed to write ${path.join(sessionDir, safeName)}: ${message}`,
        CREDENTIALS_CONTEXT
      );
    }
  }

  if (injectedCount > 0) {
    containerLog.log(
      `Injected ${injectedCount} credential file(s) from stored Agent.`,
      CREDENTIALS_CONTEXT
    );
  }
  return injectedCount > 0;
}
