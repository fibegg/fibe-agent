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

  test('returns defaults + blocked when no PROVIDER_ARGS env', () => {
    delete process.env.PROVIDER_ARGS;
    const tokens = buildProviderArgs(baseConfig);
    expect(tokens).toContain('--no-chrome');
    expect(tokens).toContain('--effort');
    expect(tokens[tokens.indexOf('--effort') + 1]).toBe('max');
    expect(tokens).toContain('--dangerously-skip-permissions');
    expect(tokens).toContain('--color');
    expect(tokens[tokens.indexOf('--color') + 1]).toBe('never');
    expect(tokens).not.toContain('--yolo');
  });

  test('user can override non-blocked defaults', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({ effort: 'low' });
    const tokens = buildProviderArgs(baseConfig);
    expect(tokens[tokens.indexOf('--effort') + 1]).toBe('low');
  });

  test('user cannot override blocked args', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({
      'dangerously-skip-permissions': false,
      color: 'always',
    });
    const tokens = buildProviderArgs(baseConfig);
    expect(tokens).toContain('--dangerously-skip-permissions');
    expect(tokens[tokens.indexOf('--color') + 1]).toBe('never');
  });

  test('user can add new flags not in defaults or blocked', () => {
    process.env.PROVIDER_ARGS = JSON.stringify({ bare: true, 'max-tokens': '4096' });
    const tokens = buildProviderArgs(baseConfig);
    expect(tokens).toContain('--bare');
    expect(tokens).toContain('--max-tokens');
    expect(tokens[tokens.indexOf('--max-tokens') + 1]).toBe('4096');
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
});
