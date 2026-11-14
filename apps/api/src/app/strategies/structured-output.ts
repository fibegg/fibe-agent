import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { ResponseFormat } from '@shared/response-format';
import type { AgentStrategy } from './strategy.types';

export class StructuredOutputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Compile per request: no unbounded global schema cache or remote ref loading. */
export function compileResponseFormat(
  value: unknown,
): ValidateFunction | undefined {
  if (value === undefined) return undefined;
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('responseFormat must be an object');
    const format = value as ResponseFormat;
    if (
      format.type !== 'json_schema' ||
      Object.keys(format).some((key) => key !== 'type' && key !== 'schema')
    ) {
      throw new Error(
        'responseFormat must contain type: json_schema and schema',
      );
    }
    if (
      !format.schema ||
      typeof format.schema !== 'object' ||
      Array.isArray(format.schema) ||
      format.schema.type !== 'object'
    ) {
      throw new Error('schema must be a JSON Schema with type: object');
    }
    if (Buffer.byteLength(JSON.stringify(format.schema)) > 65_536)
      throw new Error('schema exceeds 64 KiB');
    const visit = (node: unknown, depth: number): void => {
      if (depth > 32)
        throw new Error('schema exceeds maximum nesting depth of 32');
      if (node && typeof node === 'object') {
        for (const [key, child] of Object.entries(node)) {
          if (
            key === '$ref' &&
            typeof child === 'string' &&
            !child.startsWith('#')
          )
            throw new Error('only local schema references are supported');
          visit(child, depth + 1);
        }
      }
    };
    visit(format.schema, 0);
    const ajv = new Ajv({
      strict: true,
      allErrors: false,
      ownProperties: true,
    });
    addFormats(ajv);
    return ajv.compile(format.schema);
  } catch (error) {
    throw new StructuredOutputError(
      'INVALID_RESPONSE_FORMAT',
      error instanceof Error ? error.message : 'Invalid schema',
    );
  }
}

export function assertStructuredOutputSupport(
  strategy: AgentStrategy,
  format?: ResponseFormat,
): void {
  if (format && !strategy.supportsStructuredOutput?.()) {
    throw new StructuredOutputError(
      'STRUCTURED_OUTPUT_UNSUPPORTED',
      'The active provider or transport does not support responseFormat. Use Claude SDK, Codex app-server, or OpenCode server.',
    );
  }
}

export function validateStructuredOutput(
  validate: ValidateFunction,
  value: unknown,
): void {
  if (value === undefined || !validate(value)) {
    throw new StructuredOutputError(
      'STRUCTURED_OUTPUT_INVALID',
      'The provider did not return a final JSON object matching the requested schema.',
    );
  }
}

export function parseStructuredOutput(text: string | undefined): unknown {
  try {
    return JSON.parse(text ?? '');
  } catch {
    throw new StructuredOutputError(
      'STRUCTURED_OUTPUT_INVALID',
      'The provider did not return valid final JSON.',
    );
  }
}
