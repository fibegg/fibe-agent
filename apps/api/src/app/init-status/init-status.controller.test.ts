import { describe, test, expect } from 'bun:test';
import { buildInitStatusResponse } from './init-status.logic';

describe('InitStatusController — buildInitStatusResponse', () => {
  test('returns disabled when no script', () => {
    expect(buildInitStatusResponse(undefined, undefined, null)).toEqual({ state: 'disabled' });
  });

  test('returns disabled when script is empty string', () => {
    expect(buildInitStatusResponse('', undefined, null)).toEqual({ state: 'disabled' });
  });

  test('returns pending when script set but no state file', () => {
    expect(buildInitStatusResponse('echo hi', undefined, null)).toEqual({ state: 'pending' });
  });

  test('returns running when state file says running', () => {
    expect(buildInitStatusResponse('echo hi', undefined, { state: 'running' })).toEqual({
      state: 'running',
    });
  });

  test('returns only state when state file has no optional fields', () => {
    expect(buildInitStatusResponse('x', undefined, { state: 'running' })).toEqual({
      state: 'running',
    });
  });

  test('returns done with output and finishedAt when state file says done', () => {
    expect(
      buildInitStatusResponse('echo hi', undefined, {
        state: 'done',
        output: 'hello',
        finishedAt: '2026-03-18T12:00:00.000Z',
      })
    ).toEqual({
      state: 'done',
      output: 'hello',
      finishedAt: '2026-03-18T12:00:00.000Z',
    });
  });

  test('returns failed with error when state file says failed', () => {
    expect(
      buildInitStatusResponse('echo hi', undefined, {
        state: 'failed',
        error: 'Exit code 1',
        finishedAt: '2026-03-18T12:00:00.000Z',
      })
    ).toEqual({
      state: 'failed',
      error: 'Exit code 1',
      finishedAt: '2026-03-18T12:00:00.000Z',
    });
  });

  test('includes systemPrompt in response if provided', () => {
    expect(buildInitStatusResponse(undefined, 'my custom prompt', null)).toEqual({
      state: 'disabled',
      systemPrompt: 'my custom prompt',
    });
  });
});
