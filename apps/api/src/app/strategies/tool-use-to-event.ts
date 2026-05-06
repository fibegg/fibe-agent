import type { ToolEvent } from './strategy.types';

const FILE_WRITING_TOOL_NAMES = ['write_file', 'edit_file', 'search_replace'];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function buildCommandFromInput(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  const argsObj =
    input.arguments && typeof input.arguments === 'object'
      ? (input.arguments as Record<string, unknown>)
      : undefined;
  const base =
    typeof input.command === 'string'
      ? input.command
      : typeof argsObj?.command === 'string'
        ? argsObj.command
        : undefined;
  const extraArgs = isStringArray(input.args)
    ? input.args
    : isStringArray(argsObj?.args)
      ? argsObj.args
      : isStringArray(input.arguments)
        ? input.arguments
        : undefined;
  if (base && extraArgs?.length) return `${base.trim()} ${extraArgs.join(' ')}`.trim();
  if (base) return base;
  if (extraArgs?.length) return extraArgs.join(' ');
  return undefined;
}

export function toolUseToEvent(
  cb: { name?: string; input?: unknown },
  input: Record<string, unknown> | undefined
): ToolEvent {
  const command = buildCommandFromInput(input);
  const summary = input && !command ? JSON.stringify(input).slice(0, 200) : undefined;
  const details =
    input && typeof input === 'object' ? JSON.stringify(input).slice(0, 500) : undefined;
  const isFileTool = FILE_WRITING_TOOL_NAMES.includes((cb.name ?? '').toLowerCase());
  const pathFromInput =
    typeof input?.path === 'string'
      ? input.path
      : typeof input?.file_path === 'string'
        ? input.file_path
        : typeof input?.path_input === 'string'
          ? input.path_input
          : typeof input?.name === 'string' && isFileTool
            ? input.name
            : undefined;
  if (isFileTool && (pathFromInput ?? cb.name)) {
    return {
      kind: 'file_created',
      name:
        (pathFromInput ? pathFromInput.split(/[/\\]/).pop() : undefined) ?? cb.name ?? 'file',
      path: pathFromInput ?? cb.name,
      summary,
    };
  }
  return {
    kind: 'tool_call',
    name: cb.name ?? 'tool',
    summary,
    command,
    details,
  };
}
