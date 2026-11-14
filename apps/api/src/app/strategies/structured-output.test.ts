import { describe, expect, test } from 'bun:test';
import {
  compileResponseFormat,
  validateStructuredOutput,
  parseStructuredOutput,
  assertStructuredOutputSupport,
} from './structured-output';
import type { AgentStrategy } from './strategy.types';

const format = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: { email: { type: 'string', format: 'email' } },
    required: ['email'],
    additionalProperties: false,
  },
};

describe('structured output validation', () => {
  test('omission preserves ordinary responses', () => {
    expect(compileResponseFormat(undefined)).toBeUndefined();
    expect(() =>
      assertStructuredOutputSupport({} as AgentStrategy),
    ).not.toThrow();
  });
  test('validates types, required properties, extra properties, and formats without coercion', () => {
    const validate = compileResponseFormat(format);
    if (!validate) throw new Error('expected validator');
    expect(() =>
      validateStructuredOutput(validate, { email: 'a@example.com' }),
    ).not.toThrow();
    for (const value of [
      undefined,
      null,
      {},
      { email: 42 },
      { email: 'invalid' },
      { email: 'a@example.com', extra: true },
    ]) {
      expect(() => validateStructuredOutput(validate, value)).toThrow(
        'matching the requested schema',
      );
    }
  });
  test('rejects malformed formats, unknown keywords, and external references', () => {
    for (const value of [
      null,
      [],
      'json',
      {},
      { type: 'text' },
      { ...format, strict: true },
      { type: 'json_schema', schema: [] },
      {
        type: 'json_schema',
        schema: { type: 'object', properties: { x: { type: 'banana' } } },
      },
      { type: 'json_schema', schema: { type: 'object', typo: true } },
      {
        type: 'json_schema',
        schema: { type: 'object', $ref: 'https://example.com/schema' },
      },
    ]) {
      expect(() => compileResponseFormat(value)).toThrow();
    }
  });
  test('bounds schema size and depth and accepts local definitions', () => {
    expect(() =>
      compileResponseFormat({
        type: 'json_schema',
        schema: { type: 'object', description: 'x'.repeat(65536) },
      }),
    ).toThrow('64 KiB');
    let nested: unknown = { type: 'string' };
    for (let i = 0; i < 35; i++)
      nested = { type: 'object', properties: { child: nested } };
    expect(() =>
      compileResponseFormat({ type: 'json_schema', schema: nested }),
    ).toThrow('nesting');
    expect(
      compileResponseFormat({
        type: 'json_schema',
        schema: {
          type: 'object',
          definitions: { value: { type: 'string' } },
          properties: { value: { $ref: '#/definitions/value' } },
        },
      })?.({ value: 'ok' }),
    ).toBe(true);
  });
  test('rejects unsupported strategies and non-JSON final answers', () => {
    expect(() =>
      assertStructuredOutputSupport({} as AgentStrategy, format as never),
    ).toThrow('active provider or transport');
    expect(() => parseStructuredOutput('```json\n{}\n```')).toThrow(
      'valid final JSON',
    );
    expect(parseStructuredOutput('{"ok":true}')).toEqual({ ok: true });
  });
});
