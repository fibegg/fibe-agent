import { describe, test, expect } from 'bun:test';
import { toolUseToEvent } from './claude-code.strategy';

describe('toolUseToEvent', () => {
  test('returns file_created for write_file with path', () => {
    const event = toolUseToEvent(
      { name: 'write_file' },
      { path: 'src/foo.ts' }
    );
    expect(event.kind).toBe('file_created');
    expect(event.path).toBe('src/foo.ts');
    expect(event.name).toBe('foo.ts');
  });

  test('returns file_created for edit_file with file_path', () => {
    const event = toolUseToEvent(
      { name: 'edit_file' },
      { file_path: 'lib/bar.js' }
    );
    expect(event.kind).toBe('file_created');
    expect(event.path).toBe('lib/bar.js');
  });

  test('returns file_created for search_replace with path_input', () => {
    const event = toolUseToEvent(
      { name: 'search_replace' },
      { path_input: 'app/index.ts' }
    );
    expect(event.kind).toBe('file_created');
    expect(event.path).toBe('app/index.ts');
  });

  test('returns tool_call for run_terminal_cmd with command', () => {
    const event = toolUseToEvent(
      { name: 'run_terminal_cmd' },
      { command: 'npm install' }
    );
    expect(event.kind).toBe('tool_call');
    expect(event.command).toBe('npm install');
    expect(event.name).toBe('run_terminal_cmd');
  });

  test('returns tool_call for unknown tool name', () => {
    const event = toolUseToEvent(
      { name: 'unknown_tool' },
      { path: 'x' }
    );
    expect(event.kind).toBe('tool_call');
  });

  test('uses cb.name when input is undefined', () => {
    const event = toolUseToEvent({ name: 'write_file' }, undefined);
    expect(event.kind).toBe('file_created');
    expect(event.path).toBe('write_file');
    expect(event.name).toBe('write_file');
  });

  test('extracts command from input.arguments', () => {
    const event = toolUseToEvent(
      { name: 'run_terminal_cmd' },
      { arguments: { command: 'ls -la' } }
    );
    expect(event.kind).toBe('tool_call');
    expect(event.command).toBe('ls -la');
  });

  test('builds full command from command plus args array', () => {
    const event = toolUseToEvent(
      { name: 'run_terminal_cmd' },
      { command: 'npm', args: ['run', 'build', '--prod'] }
    );
    expect(event.kind).toBe('tool_call');
    expect(event.command).toBe('npm run build --prod');
  });

  test('builds command from arguments array only', () => {
    const event = toolUseToEvent(
      { name: 'run_terminal_cmd' },
      { arguments: ['bun', 'install', '--frozen-lockfile'] }
    );
    expect(event.kind).toBe('tool_call');
    expect(event.command).toBe('bun install --frozen-lockfile');
  });

  test('includes details for tool_call', () => {
    const event = toolUseToEvent(
      { name: 'run_terminal_cmd' },
      { command: 'echo', args: ['hello'] }
    );
    expect(event.details).toBeDefined();
    expect(JSON.parse(event.details as string)).toEqual({ command: 'echo', args: ['hello'] });
  });
});
