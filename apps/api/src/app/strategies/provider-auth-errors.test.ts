import { describe, expect, test } from 'bun:test';
import { detectProviderAuthFailure, detectProviderFailure } from '@shared/provider-auth-errors';

describe('provider failure classifier', () => {
  test('classifies structured provider quota errors without retaining prompt or key text', () => {
    const failure = detectProviderFailure(
      'ERROR service=llm error={"name":"AI_APICallError","statusCode":429,"responseBody":{"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for prompt-body-that-must-not-leak sk-test-secret"}}} stream error',
    );

    expect(failure).toMatchObject({
      kind: 'quota',
      statusCode: 429,
      providerStatus: 'RESOURCE_EXHAUSTED',
      reason: 'RESOURCE_EXHAUSTED',
    });
    expect(JSON.stringify(failure)).not.toContain('prompt-body-that-must-not-leak');
    expect(JSON.stringify(failure)).not.toContain('sk-test-secret');
  });

  test('classifies Gemini model-not-found output', () => {
    const failure = detectProviderFailure('ModelNotFoundError: Requested entity was not found.');
    expect(failure?.kind).toBe('model_not_found');
  });

  test('preserves auth failure detection for missing credentials wording', () => {
    const authError = detectProviderAuthFailure('OpenCode', 'provider credentials are missing in the runtime container');
    expect(authError?.message).toContain('Authentication failed for OpenCode');
    expect(authError?.message).toContain('credentials are missing');
  });

  test('classifies Gemini terminal quota output before generic auth wording', () => {
    const output = [
      'TerminalQuotaError: You have exhausted your daily quota on this model.',
      'code: 429',
      'If using an API key, credentials are required for requests.',
    ].join('\n');

    const failure = detectProviderFailure(output);
    expect(failure).toMatchObject({
      kind: 'quota',
      statusCode: 429,
    });
    expect(detectProviderAuthFailure('Gemini', output)).toBeNull();
  });

  test('classifies Gemini capacity exhaustion as quota', () => {
    const failure = detectProviderFailure(
      'TerminalQuotaError: You have exhausted your capacity on this model. Your quota will reset after 12h.'
    );

    expect(failure?.kind).toBe('quota');
  });
});
