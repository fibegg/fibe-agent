/**
 * Canonical agent mode definitions.
 *
 * The key is what callers send over REST/WebSocket.
 * The value is the display string shown in the chat UI.
 */
export const AGENT_MODES = {
  exploring: 'Exploring...',
  casting: 'Casting...',
  overseeing: 'Overseeing...',
  build: 'Building...',
} as const;

export type AgentModeKey = keyof typeof AGENT_MODES;
export type AgentModeValue = (typeof AGENT_MODES)[AgentModeKey];

export const DEFAULT_AGENT_MODE: AgentModeValue = AGENT_MODES.exploring;

const AGENT_MODE_TRIGGER_VALUES: Record<string, AgentModeValue> = {
  EXPLORING: AGENT_MODES.exploring,
  CASTING: AGENT_MODES.casting,
  OVERSEEING: AGENT_MODES.overseeing,
  BUILD: AGENT_MODES.build,
  BUILDING: AGENT_MODES.build,
};

/** All accepted keys */
export const AGENT_MODE_KEYS = Object.keys(AGENT_MODES) as AgentModeKey[];
/** All accepted display strings */
export const AGENT_MODE_VALUES = Object.values(AGENT_MODES) as AgentModeValue[];
/** Deterministic mode trigger words agents may emit in assistant responses. */
export const AGENT_MODE_TRIGGER_WORDS = Object.keys(AGENT_MODE_TRIGGER_VALUES).map((key) => `MODE:${key}`);

/**
 * Resolve an incoming mode string (key or display value) to its canonical display string.
 * Returns `null` when the input is not a recognised key or value.
 */
export function resolveAgentMode(raw: string): AgentModeValue | null {
  const trimmed = raw.trim();
  const triggerValue = resolveAgentModeTrigger(trimmed);
  if (triggerValue) return triggerValue;
  const lower = trimmed.toLowerCase();

  // Direct key match (e.g. "exploring")
  if (lower in AGENT_MODES) {
    return AGENT_MODES[lower as AgentModeKey];
  }

  // Display-string match (e.g. "Exploring...")
  const entry = Object.entries(AGENT_MODES).find(([, v]) => v.toLowerCase() === lower);
  if (entry) {
    return entry[1] as AgentModeValue;
  }

  return null;
}

export function resolveAgentModeTrigger(raw: string): AgentModeValue | null {
  const match = raw.trim().match(/^\[?\s*MODE\s*:\s*([A-Z][A-Z0-9_-]*)\s*\]?$/i);
  if (!match) return null;
  const key = match[1].replace(/[\s_-]+/g, '').toUpperCase();
  return AGENT_MODE_TRIGGER_VALUES[key] ?? null;
}
