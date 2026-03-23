import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { GeminiStrategy } from './gemini.strategy';

describe('GeminiStrategy API token mode', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (savedEnv.GEMINI_API_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedEnv.GEMINI_API_KEY;
  });

  test('checkAuthStatus returns false when GEMINI_API_KEY is not set in api-token mode', async () => {
    const strategy = new GeminiStrategy(true);
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(false);
  });

  test('checkAuthStatus returns true when GEMINI_API_KEY is set in api-token mode', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const strategy = new GeminiStrategy(true);
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(true);
  });

  test('executeAuth sends authSuccess when GEMINI_API_KEY is set in api-token mode', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const strategy = new GeminiStrategy(true);
    let successCalled = false;
    const noop = () => {
      return;
    };
    const connection = {
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: () => {
        successCalled = true;
      },
      sendAuthStatus: noop,
      sendError: noop,
    };
    strategy.executeAuth(connection);
    expect(successCalled).toBe(true);
  });

  test('executeAuth sends sendAuthManualToken when GEMINI_API_KEY is missing in api-token mode', () => {
    const strategy = new GeminiStrategy(true);
    let manualTokenCalled = false;
    const noop = () => {
      return;
    };
    const connection = {
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: () => {
        manualTokenCalled = true;
      },
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: noop,
    };
    strategy.executeAuth(connection);
    expect(manualTokenCalled).toBe(true);
  });

  test('submitAuthCode in api-token mode stores token and sends authSuccess', async () => {
    const strategy = new GeminiStrategy(true);
    let successCalled = false;
    const noop = () => {
      return;
    };
    const connection = {
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: () => {
        successCalled = true;
      },
      sendAuthStatus: noop,
      sendError: noop,
    };
    strategy.executeAuth(connection);
    strategy.submitAuthCode('stored-key');
    expect(successCalled).toBe(true);
    const status = await strategy.checkAuthStatus();
    expect(status).toBe(true);
  });

  test('checkAuthStatus returns true in api-token mode when only _apiToken is set', async () => {
    const strategy = new GeminiStrategy(true);
    const noop = () => {
      return;
    };
    const connection = {
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: noop,
      sendError: noop,
    };
    strategy.executeAuth(connection);
    strategy.submitAuthCode('pastede-key');
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(true);
  });

  test('submitAuthCode with empty string sends unauthenticated', () => {
    const strategy = new GeminiStrategy(true);
    let status = '';
    const noop = () => { return; };
    const connection = {
      sendAuthUrlGenerated: noop,
      sendDeviceCode: noop,
      sendAuthManualToken: noop,
      sendAuthSuccess: noop,
      sendAuthStatus: (s: string) => { status = s; },
      sendError: noop,
    };
    strategy.executeAuth(connection);
    strategy.submitAuthCode('');
    expect(status).toBe('unauthenticated');
  });

  test('cancelAuth clears state safely', () => {
    const strategy = new GeminiStrategy(true);
    strategy.cancelAuth();
    // Should not throw
  });

  test('clearCredentials is safe when no credentials exist', () => {
    const strategy = new GeminiStrategy(true);
    strategy.clearCredentials();
    // Should not throw
  });

  test('getModelArgs returns flags for valid model', () => {
    const strategy = new GeminiStrategy(true);
    expect(strategy.getModelArgs('gemini-2.5-pro')).toEqual(['-m', 'gemini-2.5-pro']);
  });

  test('getModelArgs returns empty array for empty model', () => {
    const strategy = new GeminiStrategy(true);
    expect(strategy.getModelArgs('')).toEqual([]);
  });

  test('getModelArgs returns empty for undefined model', () => {
    const strategy = new GeminiStrategy(true);
    expect(strategy.getModelArgs('undefined')).toEqual([]);
  });

  test('interruptAgent does not throw', () => {
    const strategy = new GeminiStrategy(true);
    strategy.interruptAgent();
  });

  test('constructor with conversationDataDir', () => {
    const strategy = new GeminiStrategy(false, {
      getConversationDataDir: () => '/tmp/test-conv',
    });
    expect(strategy).toBeDefined();
  });

  test('executeLogout in api-token mode clears credentials immediately', () => {
    const strategy = new GeminiStrategy(true);
    let logoutSuccessCalled = false;
    const noop = () => { return; };
    const connection = {
      sendLogoutOutput: noop,
      sendLogoutSuccess: () => { logoutSuccessCalled = true; },
      sendError: noop,
    };
    strategy.executeLogout(connection);
    expect(logoutSuccessCalled).toBe(true);
  });
});
