import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileResponseFormat } from './structured-output';

const contractDir = resolve(import.meta.dir, '../../../../../contracts/generative-chat');
const read = (name: string) => JSON.parse(readFileSync(resolve(contractDir, name), 'utf8'));

describe('mobile generative chat contract', () => {
  test('the complete and text-only examples pass existing strict structured-output admission', () => {
    const schema = read('schema.json');
    const validate = compileResponseFormat({ type: 'json_schema', schema });
    expect(validate).toBeDefined();
    expect(validate!(read('example.json'))).toBe(true);
    expect(validate!(read('text-example.json'))).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(schema))).toBeLessThan(65_536);
  });

  test('every inference object uses explicit required properties for strict provider schemas', () => {
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const value = node as Record<string, unknown>;
      if (value.type === 'object') {
        expect(value.additionalProperties).toBe(false);
        expect([...(value.required as string[])].sort()).toEqual(Object.keys(value.properties as object).sort());
      }
      Object.values(value).forEach(visit);
    };
    visit(read('schema.json'));
  });

  test('rejects remote actions, form controls, expressions, and unsupported versions', () => {
    const validate = compileResponseFormat({ type: 'json_schema', schema: read('schema.json') })!;
    const action = read('example.json');
    const button = action.a2uiMessages[0].createSurface.components.find((item: { component: string }) => item.component === 'Button');
    button.action.functionCall['@call'] = 'rollout';
    expect(validate(action)).toBe(false);

    for (const patch of [
      { component: 'TextField', value: '' },
      { component: 'Text', text: { '@path': '/remote' }, variant: 'body', weight: 0 },
      { component: 'Button', child: 'label', variant: 'default', action: { event: { name: 'refresh' } } },
    ]) {
      const output = read('example.json');
      output.a2uiMessages[0].createSurface.components = [{ id: 'root', ...patch }];
      expect(validate(output)).toBe(false);
    }
    const future = read('text-example.json');
    future.version = 2;
    expect(validate(future)).toBe(false);
  });
});
