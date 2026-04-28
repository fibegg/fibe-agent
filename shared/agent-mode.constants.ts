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
  greenfielding: 'Greenfielding...',
  brownfielding: 'Brownfielding...',
} as const;

export type AgentModeKey = keyof typeof AGENT_MODES;
export type AgentModeValue = (typeof AGENT_MODES)[AgentModeKey];

export const DEFAULT_AGENT_MODE: AgentModeValue = AGENT_MODES.exploring;

/** All accepted keys */
export const AGENT_MODE_KEYS = Object.keys(AGENT_MODES) as AgentModeKey[];
/** All accepted display strings */
export const AGENT_MODE_VALUES = Object.values(AGENT_MODES) as AgentModeValue[];

/**
 * Resolve an incoming mode string (key or display value) to its canonical display string.
 * Returns `null` when the input is not a recognised key or value.
 */
export function resolveAgentMode(raw: string): AgentModeValue | null {
  const trimmed = raw.trim();

  // Direct key match (e.g. "exploring")
  if (trimmed in AGENT_MODES) {
    return AGENT_MODES[trimmed as AgentModeKey];
  }

  // Display-string match (e.g. "Exploring...") — backwards compat with old shell script
  const entry = Object.entries(AGENT_MODES).find(([, v]) => v === trimmed);
  if (entry) {
    return entry[1] as AgentModeValue;
  }

  return null;
}
