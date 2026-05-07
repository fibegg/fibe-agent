import { describe, test, expect } from 'bun:test';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { handleSendMessage } from './agent-send-message.handler';
import { ERROR_CODE } from '@shared/ws-constants';

describe('handleSendMessage', () => {
  // ─── Success paths ──────────────────────────────────────────────────────────

  test('returns accepted + messageId when result is accepted', () => {
    const result = handleSendMessage({ accepted: true, messageId: 'msg-123' });
    expect(result.accepted).toBe(true);
    expect(result.messageId).toBe('msg-123');
  });

  test('includes resolvedPolicy when present', () => {
    const result = handleSendMessage({ accepted: true, messageId: 'msg-456', resolvedPolicy: 'queue' });
    expect(result.resolvedPolicy).toBe('queue');
  });

  test('omits resolvedPolicy when not present', () => {
    const result = handleSendMessage({ accepted: true, messageId: 'msg-789' });
    expect('resolvedPolicy' in result).toBe(false);
  });

  test('omits resolvedPolicy when empty string', () => {
    const result = handleSendMessage({ accepted: true, messageId: 'msg-000', resolvedPolicy: '' });
    expect('resolvedPolicy' in result).toBe(false);
  });

  // ─── Error: not accepted ────────────────────────────────────────────────────

  test('throws ForbiddenException when error is NEED_AUTH', () => {
    expect(() => handleSendMessage({ accepted: false, error: ERROR_CODE.NEED_AUTH }))
      .toThrow(ForbiddenException);
  });

  test('throws ConflictException when error is AGENT_BUSY', () => {
    expect(() => handleSendMessage({ accepted: false, error: ERROR_CODE.AGENT_BUSY }))
      .toThrow(ConflictException);
  });

  test('throws NotFoundException when error is "Conversation not found"', () => {
    expect(() => handleSendMessage({ accepted: false, error: 'Conversation not found' }))
      .toThrow(NotFoundException);
  });

  test('throws BadRequestException for unknown errors', () => {
    expect(() => handleSendMessage({ accepted: false, error: 'Something unexpected' }))
      .toThrow(BadRequestException);
  });

  test('throws BadRequestException with "Unknown error" when error is undefined', () => {
    expect(() => handleSendMessage({ accepted: false }))
      .toThrow(BadRequestException);
  });

  // ─── Error: accepted but missing messageId ──────────────────────────────────

  test('throws BadRequestException when accepted but messageId is undefined', () => {
    expect(() => handleSendMessage({ accepted: true, messageId: undefined }))
      .toThrow(BadRequestException);
  });

  test('throws BadRequestException when accepted but messageId is null', () => {
    expect(() => handleSendMessage({ accepted: true, messageId: null as unknown as string }))
      .toThrow(BadRequestException);
  });

  // ─── Exception message content ──────────────────────────────────────────────

  test('ForbiddenException message contains NEED_AUTH code', () => {
    try {
      handleSendMessage({ accepted: false, error: ERROR_CODE.NEED_AUTH });
    } catch (e) {
      expect((e as Error).message).toContain(ERROR_CODE.NEED_AUTH);
    }
  });

  test('ConflictException message contains AGENT_BUSY code', () => {
    try {
      handleSendMessage({ accepted: false, error: ERROR_CODE.AGENT_BUSY });
    } catch (e) {
      expect((e as Error).message).toContain(ERROR_CODE.AGENT_BUSY);
    }
  });

  test('BadRequestException propagates the custom error message', () => {
    try {
      handleSendMessage({ accepted: false, error: 'custom error text' });
    } catch (e) {
      expect((e as Error).message).toContain('custom error text');
    }
  });
});
