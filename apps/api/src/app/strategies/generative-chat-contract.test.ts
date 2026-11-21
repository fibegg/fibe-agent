import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileResponseFormat } from './structured-output';

const contractDir = resolve(import.meta.dir, '../../../../../contracts/generative-chat');
const read = (name: string) => JSON.parse(readFileSync(resolve(contractDir, name), 'utf8'));

type Component = { id: string; component: string; [key: string]: unknown };
const components = (output: { a2uiMessages: { createSurface: { components: Component[] } }[] }) =>
  output.a2uiMessages[0].createSurface.components;

/** Strict provider schemas list every property as required and refuse extra keys. */
const expectStrictObjects = (schema: unknown) => {
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const value = node as Record<string, unknown>;
    if (value.type === 'object') {
      expect(value.additionalProperties).toBe(false);
      expect([...(value.required as string[])].sort()).toEqual(Object.keys(value.properties as object).sort());
    }
    Object.values(value).forEach(visit);
  };
  visit(schema);
};

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
    expectStrictObjects(read('schema.json'));
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

describe('mobile generative chat contract version 2', () => {
  const schema = read('schema-v2.json');
  const validate = compileResponseFormat({ type: 'json_schema', schema })!;

  test('the rich and text-only examples pass strict admission within the size ceiling', () => {
    expect(validate(read('example-v2.json'))).toBe(true);
    expect(validate(read('text-example-v2.json'))).toBe(true);
    // Sent with every model request of a turn: keep it compact.
    expect(Buffer.byteLength(JSON.stringify(schema))).toBeLessThan(14 * 1024);
  });

  test('strict provider invariants hold and the example exercises every component', () => {
    expectStrictObjects(schema);
    const branches = schema.properties.a2uiMessages.items.properties.createSurface.properties.components.items.anyOf;
    const names = branches.flatMap((branch: { properties: { component: { enum: string[] } } }) => branch.properties.component.enum);
    expect(new Set(components(read('example-v2.json')).map((item) => item.component))).toEqual(new Set(names));
    const enumValues = JSON.stringify(schema).match(/"enum":\[[^\]]*\]/g)!.join(',').split(',').length;
    expect(enumValues).toBeLessThan(1000);
  });

  test('accepts semantic, named and hex colors and refuses anything else', () => {
    for (const color of ['success', 'green', 'mint', '#1E7F3A', 'none']) {
      const output = read('example-v2.json');
      components(output).find((item) => item.id === 'hostBadge')!.color = color;
      expect(validate(output)).toBe(true);
    }
    for (const color of ['chartreuse', '#12345', 'rgb(0,128,0)', 'url(https://example.com)']) {
      const output = read('example-v2.json');
      components(output).find((item) => item.id === 'hostBadge')!.color = color;
      expect(validate(output)).toBe(false);
    }
  });

  test('rejects remote actions, media, expressions, unknown keys and older versions', () => {
    const edits: ((items: Component[]) => void)[] = [
      (items) => {
        const button = items.find((item) => item.component === 'Button') as { action: { functionCall: Record<string, unknown> } };
        button.action.functionCall['@call'] = 'rollout';
      },
      (items) => {
        const button = items.find((item) => item.component === 'Button') as { action: unknown };
        button.action = { event: { name: 'refresh' } };
      },
      (items) => items.push({ id: 'photo', component: 'Image', url: 'https://example.com/a.png' }),
      (items) => items.push({ id: 'form', component: 'TextField', value: '' }),
      (items) => {
        items.find((item) => item.id === 'headerTitle')!.text = { '@path': '/remote' };
      },
      (items) => {
        items.find((item) => item.id === 'hostBadge')!.onTap = 'rollout';
      },
      (items) => {
        items.find((item) => item.id === 'disk')!.value = 1.5;
      },
    ];
    for (const edit of edits) {
      const output = read('example-v2.json');
      edit(components(output));
      expect(validate(output)).toBe(false);
    }
    const older = read('text-example-v2.json');
    older.version = 1;
    expect(validate(older)).toBe(false);
  });
});
