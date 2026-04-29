/**
 * Provider Args: Centralized CLI argument resolution from PROVIDER_ARGS env variable.
 *
 * Each strategy defines its own BLOCKED_ARGS — critical flags that must never be
 * overridden by the player. The value in BLOCKED_ARGS is the enforced value:
 *   - `true`  → boolean flag (always emitted, e.g. `--yolo`)
 *   - string  → value flag (always emitted with that value, e.g. `--color never`)
 *   - `false` → presence-only block (flag is stripped from user input)
 *
 * DEFAULT_ARGS are the strategy's baseline. They can be overridden by PROVIDER_ARGS
 * unless they appear in BLOCKED_ARGS.
 *
 * Resolution: DEFAULT_ARGS ← PROVIDER_ARGS (env) ← BLOCKED_ARGS (enforced)
 */

export interface BlockedArgs {
  [flag: string]: true | false | string;
}

export interface ProviderArgsConfig {
  /** Strategy defaults — overrideable by PROVIDER_ARGS unless blocked */
  defaultArgs: Record<string, string | true>;
  /** Non-overrideable flags: key = flag name, value = enforced value */
  blockedArgs: BlockedArgs;
}

/**
 * Parse PROVIDER_ARGS env and merge with strategy defaults + blocked args.
 * Returns an array of CLI tokens ready to spread into spawn args.
 */
export function buildProviderArgs(config: ProviderArgsConfig): string[] {
  const { defaultArgs, blockedArgs } = config;

  // Parse env
  let userArgs: Record<string, string | true> = {};
  const raw = process.env.PROVIDER_ARGS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        userArgs = parsed;
      }
    } catch {
      // Invalid JSON — ignore silently, use defaults only
    }
  }

  // Merge: defaults ← user ← blocked
  const merged: Record<string, string | true> = { ...defaultArgs };

  // Apply user overrides (skip blocked keys)
  for (const [key, value] of Object.entries(userArgs)) {
    const flag = key.startsWith('--') ? key : `--${key}`;
    if (flag in blockedArgs) continue; // silently skip blocked
    merged[flag] = value === true ? true : String(value);
  }

  // Enforce blocked args
  for (const [flag, value] of Object.entries(blockedArgs)) {
    if (value === false) {
      // false means "strip this flag entirely"
      delete merged[flag];
      continue;
    }
    merged[flag] = value;
  }

  // Convert to CLI tokens
  const tokens: string[] = [];
  for (const [flag, value] of Object.entries(merged)) {
    tokens.push(flag);
    if (typeof value === 'string') {
      tokens.push(value);
    }
    // true = boolean flag, no value needed
  }

  return tokens;
}
