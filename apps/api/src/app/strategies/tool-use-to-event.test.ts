import { describe, expect, test } from 'bun:test';
import { toolUseToEvent } from './tool-use-to-event';

describe('toolUseToEvent', () => {
  test('maps file writing tools to file_created events', () => {
    expect(toolUseToEvent({ name: 'write_file' }, { path: 'src/app.ts' })).toEqual({
      kind: 'file_created',
      name: 'app.ts',
      path: 'src/app.ts',
      summary: '{"path":"src/app.ts"}',
    });
  });

  test('extracts shell command and args from tool input', () => {
    expect(toolUseToEvent({ name: 'bash' }, { command: 'npm', args: ['test'] })).toEqual({
      kind: 'tool_call',
      name: 'bash',
      summary: undefined,
      command: 'npm test',
      details: '{"command":"npm","args":["test"]}',
    });
  });

  test('summarizes non-command inputs', () => {
    const event = toolUseToEvent({ name: 'read' }, { path: 'README.md' });

    expect(event.kind).toBe('tool_call');
    expect(event.summary).toBe('{"path":"README.md"}');
    expect(event.command).toBeUndefined();
  });
});
