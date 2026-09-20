/**
 * Merges strategy defaults, player PROVIDER_ARGS, then enforced flags. A blocked
 * true emits the flag, a string pins its value, and false removes it.
 */

export interface BlockedArgs {
  [flag: string]: true | false | string;
}

export interface ProviderArgsConfig {
  /** Defaults that PROVIDER_ARGS may override unless blocked. */
  defaultArgs: Record<string, string | true>;
  /** Non-overrideable flags and their enforced values. */
  blockedArgs: BlockedArgs;
}

function normalizeFlagKey(key: string): string {
  if (key.startsWith('-')) return key;
  return key.length === 1 ? `-${key}` : `--${key}`;
}

function normalizeDefaultArgs(
  defaultArgs: Record<string, string | true>,
): Record<string, string | true> {
  return Object.fromEntries(
    Object.entries(defaultArgs).map(([key, value]) => [
      normalizeFlagKey(key),
      value === true ? true : String(value),
    ]),
  );
}

function normalizeBlockedArgs(blockedArgs: BlockedArgs): BlockedArgs {
  return Object.fromEntries(
    Object.entries(blockedArgs).map(([key, value]) => [
      normalizeFlagKey(key),
      value,
    ]),
  );
}

function normalizeUserValue(value: unknown): string | true | null {
  if (value === true) return true;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** Returns merged provider arguments as CLI tokens. */
export function buildProviderArgs(config: ProviderArgsConfig): string[] {
  const defaultArgs = normalizeDefaultArgs(config.defaultArgs);
  const blockedArgs = normalizeBlockedArgs(config.blockedArgs);

  let userArgs: Record<string, unknown> = {};
  const raw = process.env.PROVIDER_ARGS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        userArgs = parsed;
      }
    } catch {
      // Invalid overrides fall back to defaults.
    }
  }

  const merged: Record<string, string | true> = { ...defaultArgs };

  for (const [key, value] of Object.entries(userArgs)) {
    const flag = normalizeFlagKey(key);
    if (flag in blockedArgs) continue;
    const normalizedValue = normalizeUserValue(value);
    if (normalizedValue === null) continue;
    merged[flag] = normalizedValue;
  }

  for (const [flag, value] of Object.entries(blockedArgs)) {
    if (value === false) {
      delete merged[flag];
      continue;
    }
    merged[flag] = value;
  }

  const tokens: string[] = [];
  for (const [flag, value] of Object.entries(merged)) {
    tokens.push(flag);
    if (typeof value === 'string') {
      tokens.push(value);
    }
  }

  return tokens;
}
