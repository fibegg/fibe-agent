import { describe, expect, test } from 'bun:test';
import { AGENT_MODES } from '@shared/agent-mode.constants';
import {
  createAgentModeTriggerStream,
  stripAgentModeTriggers,
} from './agent-mode-trigger-stream';

describe('agent mode trigger stream', () => {
  test('strips MODE:BUILD and resolves Building mode', () => {
    const modes: string[] = [];
    const output = stripAgentModeTriggers('MODE:BUILD\nStarting now.', (mode) => modes.push(mode));

    expect(output).toBe('\nStarting now.');
    expect(modes).toEqual([AGENT_MODES.build]);
  });

  test('maps legacy brownfield and greenfield triggers to Building mode', () => {
    const modes: string[] = [];
    const output = stripAgentModeTriggers('MODE:BROWNFIELD MODE:GREENFIELD working', (mode) => modes.push(mode));

    expect(output).toBe('  working');
    expect(modes).toEqual([AGENT_MODES.build, AGENT_MODES.build]);
  });

  test('detects trigger words split across streaming chunks', () => {
    const modes: string[] = [];
    const stream = createAgentModeTriggerStream((mode) => modes.push(mode));

    expect(stream.push('Preparing MO')).toBe('Preparing ');
    expect(stream.push('DE:BUI')).toBe('');
    expect(stream.push('LD for changes')).toBe(' for changes');
    expect(stream.flush()).toBe('');
    expect(modes).toEqual([AGENT_MODES.build]);
  });

  test('flushes incomplete trigger-like text as visible content', () => {
    const modes: string[] = [];
    const stream = createAgentModeTriggerStream((mode) => modes.push(mode));

    expect(stream.push('Literal MODE:BUI')).toBe('Literal ');
    expect(stream.flush()).toBe('MODE:BUI');
    expect(modes).toEqual([]);
  });

  test('does not hold ordinary words ending in a trigger prefix letter', () => {
    const stream = createAgentModeTriggerStream(() => undefined);

    expect(stream.push('I am ')).toBe('I am ');
    expect(stream.flush()).toBe('');
  });
});
