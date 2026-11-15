/**
 * Work modes agents announce in their replies. The Fibe skills ask an agent to map each request to one mode
 * and announce it (`[MODE:BROWNFIELD]`, `[DIALOG]`). The prompt frame `[MODE]Exploring...[/MODE]` is often
 * copied into replies as `[MODE]Brownfield[/MODE]`. The chat shows these as small icons instead of text.
 */
export type AgentWorkMode =
  | 'dialog'
  | 'sideEffects'
  | 'greenfield'
  | 'brownfield'
  | 'overseer'
  | 'exploring'
  | 'casting'
  | 'building';

export const AGENT_WORK_MODE_TITLES: Record<AgentWorkMode, string> = {
  dialog: 'Dialog',
  sideEffects: 'Side effects',
  greenfield: 'Greenfield',
  brownfield: 'Brownfield',
  overseer: 'Overseer',
  exploring: 'Exploring',
  casting: 'Casting',
  building: 'Building',
};

const MODE_TOKENS: Record<string, AgentWorkMode> = {
  DIALOG: 'dialog',
  DIALOGUE: 'dialog',
  SIDEEFFECTS: 'sideEffects',
  SIDEEFFECT: 'sideEffects',
  GREENFIELD: 'greenfield',
  GREENFIELDING: 'greenfield',
  BROWNFIELD: 'brownfield',
  BROWNFIELDING: 'brownfield',
  OVERSEER: 'overseer',
  OVERSEEING: 'overseer',
  EXPLORING: 'exploring',
  CASTING: 'casting',
  BUILD: 'building',
  BUILDING: 'building',
};

export function agentWorkMode(token: string): AgentWorkMode | null {
  return MODE_TOKENS[token.toUpperCase().replace(/[^A-Z]/g, '')] ?? null;
}

const FRAMED =
  /(?:\*\*|__)?\[\s*MODE\s*\]\s*([A-Za-z][A-Za-z _.-]{0,30}?)\s*\[\s*\/\s*MODE\s*\](?:\*\*|__)?[ \t]*/gi;
const PREFIXED =
  /(?:\*\*|__)?\[\s*MODE\s*:\s*([A-Za-z][A-Za-z _-]{0,24}?)\s*\](?!\()(?:\*\*|__)?/gi;
const BARE = /^\s*(?:\*\*|__)?\[\s*([A-Za-z][A-Za-z _-]{0,24}?)\s*\](?!\()(?:\*\*|__)?[ \t]*/;
/** The unfinished last line of a streaming reply that may still become a marker. */
const PARTIAL =
  /^\s*(?:\*\*|__)?\[(?:[A-Za-z:_ -]{0,30}|\s*MODE\s*\][^\]]{0,40})$/i;

export interface AgentModeText {
  modes: AgentWorkMode[];
  text: string;
}

function strip(line: string, pattern: RegExp, modes: AgentWorkMode[]): string {
  return line.replace(pattern, (match, token: string) => {
    const mode = agentWorkMode(token);
    if (!mode) return match;
    modes.push(mode);
    return '';
  });
}

/**
 * Splits an assistant reply into the modes it announced and the text to show without the markers.
 * `[MODE:X]` and `[MODE]X[/MODE]` are removed anywhere outside code blocks; a bare `[X]` only at the start
 * of a line, so checklists (`[x]`), links (`[text](url)`) and unknown bracketed words stay as written.
 */
export function parseAgentModeText(raw: string, streaming = false): AgentModeText {
  if (!raw.includes('[')) return { modes: [], text: raw };
  const found: AgentWorkMode[] = [];
  const lines: string[] = [];
  let inFence = false;
  const source = raw.split('\n');
  source.forEach((original, index) => {
    if (original.trim().startsWith('```')) {
      inFence = !inFence;
      lines.push(original);
      return;
    }
    if (inFence) {
      lines.push(original);
      return;
    }
    if (streaming && index === source.length - 1 && PARTIAL.test(original)) return;
    let line = strip(original, FRAMED, found);
    line = strip(line, BARE, found);
    line = strip(line, PREFIXED, found);
    if (line !== original && line.trim() === '') return;
    lines.push(line);
  });
  const modes = found.filter((mode, index) => index === 0 || found[index - 1] !== mode);
  return { modes, text: lines.join('\n').replace(/^\n+/, '') };
}
