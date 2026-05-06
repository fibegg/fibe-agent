import {
  AGENT_MODE_TRIGGER_WORDS,
  resolveAgentMode,
  type AgentModeValue,
} from '@shared/agent-mode.constants';

const MODE_TRIGGER_PATTERN =
  /\[?\bMODE\s*:\s*(EXPLORING|CASTING|OVERSEEING|BUILDING|BUILD)\b\]?/gi;

const NORMALIZED_TRIGGER_WORDS = AGENT_MODE_TRIGGER_WORDS.map(normalizeTriggerCandidate);
const LONGEST_TRIGGER_WORD_LENGTH = Math.max(...NORMALIZED_TRIGGER_WORDS.map((word) => word.length));

export interface AgentModeTriggerStream {
  push(chunk: string): string;
  flush(): string;
}

export function createAgentModeTriggerStream(
  onMode: (mode: AgentModeValue) => void,
): AgentModeTriggerStream {
  let pending = '';

  return {
    push(chunk: string): string {
      if (!chunk) return '';
      const combined = pending + chunk;
      const holdLength = incompleteTriggerSuffixLength(combined);
      const ready = holdLength > 0 ? combined.slice(0, -holdLength) : combined;
      pending = holdLength > 0 ? combined.slice(-holdLength) : '';
      return stripAgentModeTriggers(ready, onMode);
    },
    flush(): string {
      const ready = pending;
      pending = '';
      return stripAgentModeTriggers(ready, onMode);
    },
  };
}

export function stripAgentModeTriggers(
  text: string,
  onMode: (mode: AgentModeValue) => void,
): string {
  return text.replace(MODE_TRIGGER_PATTERN, (match) => {
    const resolved = resolveAgentMode(match);
    if (resolved) {
      onMode(resolved);
      return '';
    }
    return match;
  });
}

function incompleteTriggerSuffixLength(text: string): number {
  const maxLength = Math.min(text.length, LONGEST_TRIGGER_WORD_LENGTH + 1);
  for (let length = maxLength; length > 0; length -= 1) {
    const suffix = text.slice(-length);
    const candidate = suffix.trimStart();
    const leadingWhitespaceLength = suffix.length - candidate.length;
    const normalized = normalizeTriggerCandidate(candidate);
    if (!normalized || resolveAgentMode(suffix)) continue;
    if (NORMALIZED_TRIGGER_WORDS.some((word) => word.startsWith(normalized))) {
      return length - leadingWhitespaceLength;
    }
  }
  return 0;
}

function normalizeTriggerCandidate(value: string): string {
  const candidate = value
    .trimStart()
    .replace(/^\[/, '');
  if (!candidate || /\s/.test(candidate)) return '';
  return candidate.toUpperCase();
}
