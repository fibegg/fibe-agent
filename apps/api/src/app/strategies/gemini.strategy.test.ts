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
    const connection = {
      sendAuthUrlGenerated: () => {},
      sendDeviceCode: () => {},
      sendAuthManualToken: () => {},
      sendAuthSuccess: () => {
        successCalled = true;
      },
      sendAuthStatus: () => {},
      sendError: () => {},
    };
    strategy.executeAuth(connection);
    expect(successCalled).toBe(true);
  });

  test('executeAuth sends sendAuthManualToken when GEMINI_API_KEY is missing in api-token mode', () => {
    const strategy = new GeminiStrategy(true);
    let manualTokenCalled = false;
    const connection = {
      sendAuthUrlGenerated: () => {},
      sendDeviceCode: () => {},
      sendAuthManualToken: () => {
        manualTokenCalled = true;
      },
      sendAuthSuccess: () => {},
      sendAuthStatus: () => {},
      sendError: () => {},
    };
    strategy.executeAuth(connection);
    expect(manualTokenCalled).toBe(true);
  });

  test('submitAuthCode in api-token mode stores token and sends authSuccess', async () => {
    const strategy = new GeminiStrategy(true);
    let successCalled = false;
    const connection = {
      sendAuthUrlGenerated: () => {},
      sendDeviceCode: () => {},
      sendAuthManualToken: () => {},
      sendAuthSuccess: () => {
        successCalled = true;
      },
      sendAuthStatus: () => {},
      sendError: () => {},
    };
    strategy.executeAuth(connection);
    strategy.submitAuthCode('stored-key');
    expect(successCalled).toBe(true);
    const status = await strategy.checkAuthStatus();
    expect(status).toBe(true);
  });

  test('checkAuthStatus returns true in api-token mode when only _apiToken is set', async () => {
    const strategy = new GeminiStrategy(true);
    const connection = {
      sendAuthUrlGenerated: () => {},
      sendDeviceCode: () => {},
      sendAuthManualToken: () => {},
      sendAuthSuccess: () => {},
      sendAuthStatus: () => {},
      sendError: () => {},
    };
    strategy.executeAuth(connection);
    strategy.submitAuthCode('pastede-key');
    const result = await strategy.checkAuthStatus();
    expect(result).toBe(true);
  });
});
