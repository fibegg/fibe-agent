import { buildProviderArgs, type ProviderArgsConfig } from './provider-args';

describe('buildProviderArgs', () => {
  const originalEnv = process.env.PROVIDER_ARGS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.PROVIDER_ARGS;
    } else {
      process.env.PROVIDER_ARGS = originalEnv;
    }
  });

  const baseConfig: ProviderArgsConfig = {
    defaultArgs: {
      '--no-chrome': true,
      '--effort': 'max',
    },
    blockedArgs: {
      '--dangerously-skip-permissions': true,
      '--color': 'never',
      '--yolo': false,
    },
  };

  function valueAfter(tokens: string[], flag: string): string | undefined {
    const index = tokens.indexOf(flag);
    return index === -1 ? undefined : tokens[index + 1];
  }

  test('returns defaults + blocked when no PROVIDER_ARGS env', () => {
    delete process.env.PROVIDER_ARGS;
    const tokens = buildProviderArgs(baseConfig);
    expect(tokens).toContain('--no-chrome');
    expect(tokens).toContain('--effort');
    expect(valueAfter(tokens, '--effort')).toBe('max');
    expect(tokens).toContain('--dangerously-skip-permissions');
    expect(tokens).toContain('--color');
    expect(valueAfter(tokens, '--color')).toBe('never');
    expect(tokens).not.toContain('--yolo');
  });

  test('user can override non-blocked defaults', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({ effort: 'low' });
    const tokens = buildProviderArgs(baseConfig);
    expect(valueAfter(tokens, '--effort')).toBe('low');
  });

  test('user cannot override blocked args', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({
      'dangerously-skip-permissions': false,
      color: 'always',
    });
    const tokens = buildProviderArgs(baseConfig);
    expect(tokens).toContain('--dangerously-skip-permissions');
    expect(valueAfter(tokens, '--color')).toBe('never');
  });

  test('user can add new flags not in defaults or blocked', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({ bare: true, 'max-tokens': '4096' });
    const tokens = buildProviderArgs(baseConfig);
    expect(tokens).toContain('--bare');
    expect(tokens).toContain('--max-tokens');
    expect(valueAfter(tokens, '--max-tokens')).toBe('4096');
  });

  test('invalid JSON in PROVIDER_ARGS is silently ignored', () => {
    process.env.PROVIDER_ARGS = 'not-json{';
    const tokens = buildProviderArgs(baseConfig);
    // Should still produce defaults + blocked
    expect(tokens).toContain('--no-chrome');
    expect(tokens).toContain('--dangerously-skip-permissions');
  });

  test('blocked false strips the flag entirely', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({ yolo: true });
    const tokens = buildProviderArgs(baseConfig);
    expect(tokens).not.toContain('--yolo');
  });

  test('handles --prefixed keys in PROVIDER_ARGS', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({ '--bare': true });
    const tokens = buildProviderArgs(baseConfig);
    expect(tokens).toContain('--bare');
  });

  test('emits single-letter user keys as short flags', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({ c: 'never' });
    const tokens = buildProviderArgs(baseConfig);
    expect(tokens).toContain('-c');
    expect(valueAfter(tokens, '-c')).toBe('never');
  });

  test('blocks short flags when user input came from normalized settings', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({ p: 'do not inject this prompt' });
    const tokens = buildProviderArgs({
      defaultArgs: {},
      blockedArgs: { '-p': false },
    });
    expect(tokens).not.toContain('-p');
    expect(tokens).not.toContain('--p');
    expect(tokens).not.toContain('do not inject this prompt');
  });

  test('strips the complete common blocked command matrix after key normalization', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({
      'max-tokens': 4096,
      'dangerously-skip-permissions': true,
      'dangerously-bypass-approvals-and-sandbox': true,
      daemon: true,
      detach: true,
      force: true,
      format: 'json',
      json: true,
      'output-format': 'stream-json',
      print: true,
      prompt: 'blocked prompt',
      yolo: true,
      d: true,
      p: 'blocked short prompt',
    });

    const tokens = buildProviderArgs({
      defaultArgs: {},
      blockedArgs: {
        '--dangerously-skip-permissions': false,
        '--dangerously-bypass-approvals-and-sandbox': false,
        '--daemon': false,
        '--detach': false,
        '--force': false,
        '--format': false,
        '--json': false,
        '--output-format': false,
        '--print': false,
        '--prompt': false,
        '--yolo': false,
        '-d': false,
        '-p': false,
      },
    });

    expect(tokens).toEqual(['--max-tokens', '4096']);
  });

  test('normalizes unprefixed default and blocked config keys', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({
      color: 'always',
      p: 'blocked prompt',
      maxTokens: 8192,
    });

    const tokens = buildProviderArgs({
      defaultArgs: {
        color: 'auto',
        c: 'never',
      },
      blockedArgs: {
        color: 'never',
        p: false,
      },
    });

    expect(tokens).toEqual(['--color', 'never', '-c', 'never', '--maxTokens', '8192']);
  });

  test('serializes the complete supported scalar matrix from PROVIDER_ARGS', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({
      bare: true,
      sandbox: false,
      'max-tokens': 4096,
      temperature: 0.2,
      config: 'value with spaces',
      c: 'never',
    });

    const tokens = buildProviderArgs({ defaultArgs: {}, blockedArgs: {} });

    expect(tokens).toEqual([
      '--bare',
      '--sandbox',
      'false',
      '--max-tokens',
      '4096',
      '--temperature',
      '0.2',
      '--config',
      'value with spaces',
      '-c',
      'never',
    ]);
  });

  test('drops unsupported PROVIDER_ARGS values instead of emitting accidental strings', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({
      keep: 'safe',
      nullish: null,
      nested: { unsafe: true },
      list: ['unsafe'],
      infinite: Number.POSITIVE_INFINITY,
    });

    const tokens = buildProviderArgs({ defaultArgs: {}, blockedArgs: {} });

    expect(tokens).toEqual(['--keep', 'safe']);
    expect(tokens).not.toContain('--nullish');
    expect(tokens).not.toContain('--nested');
    expect(tokens).not.toContain('[object Object]');
    expect(tokens).not.toContain('--list');
  });

  test('ignores non-object PROVIDER_ARGS payloads', () => {
    process.env.PROVIDER_ARGS = JSON.stringify(['--bare']);
    expect(buildProviderArgs(baseConfig)).toContain('--no-chrome');

    process.env.PROVIDER_ARGS = JSON.stringify(null);
    expect(buildProviderArgs(baseConfig)).toContain('--no-chrome');
  });
});
