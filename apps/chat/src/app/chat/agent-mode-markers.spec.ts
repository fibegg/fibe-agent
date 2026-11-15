import { describe, expect, it } from 'vitest';
import { parseAgentModeText } from './agent-mode-markers';

describe('parseAgentModeText', () => {
  it('turns the skill marker into a mode', () => {
    expect(parseAgentModeText("[MODE:BROWNFIELD]\nI'll polish the popup.")).toEqual({
      modes: ['brownfield'],
      text: "I'll polish the popup.",
    });
  });

  it('turns the framed marker copied from the prompt into a mode', () => {
    expect(parseAgentModeText("[MODE]Brownfield[/MODE]\n\nI'll polish the popup.")).toEqual({
      modes: ['brownfield'],
      text: "I'll polish the popup.",
    });
  });

  it('accepts agent labels, emphasis, spacing and a bare marker at a line start', () => {
    expect(parseAgentModeText('[MODE]Exploring...[/MODE] Looking around.')).toEqual({
      modes: ['exploring'],
      text: 'Looking around.',
    });
    expect(parseAgentModeText('**[mode] Side effects [/mode]**').modes).toEqual(['sideEffects']);
    expect(parseAgentModeText('[DIALOG] Here is how it works.')).toEqual({
      modes: ['dialog'],
      text: 'Here is how it works.',
    });
  });

  it('keeps every announced mode in order without repeats', () => {
    const reply = parseAgentModeText('[MODE:GREENFIELD]\nCreated it.\n[MODE:GREENFIELD]\n[MODE:BROWNFIELD]\nNow editing.');
    expect(reply.modes).toEqual(['greenfield', 'brownfield']);
    expect(reply.text).toBe('Created it.\nNow editing.');
  });

  it('leaves unknown markers, code, checklists and links as written', () => {
    expect(parseAgentModeText('[MODE]Plan[/MODE] next').text).toBe('[MODE]Plan[/MODE] next');
    const code = '```\n[MODE]Brownfield[/MODE]\n[MODE:DIALOG]\n```';
    expect(parseAgentModeText(code)).toEqual({ modes: [], text: code });
    const list = '[x] done\n[docs](https://example.com)';
    expect(parseAgentModeText(list)).toEqual({ modes: [], text: list });
  });

  it('holds an unfinished marker while the reply streams', () => {
    expect(parseAgentModeText('[MODE]Brownf', true).text).toBe('');
    expect(parseAgentModeText('[MODE]Brownfield[/MO', true).text).toBe('');
    expect(parseAgentModeText('[MODE:BROWN', true).text).toBe('');
    expect(parseAgentModeText("[MODE]Brownfield[/MODE]\nI'll", true)).toEqual({
      modes: ['brownfield'],
      text: "I'll",
    });
  });
});
