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
  test('returns accepted and messageId when result is accepted', () => {
    const result = handleSendMessage({
      accepted: true,
      messageId: 'msg-uuid-123',
    });
    expect(result.accepted).toBe(true);
    expect(result.messageId).toBe('msg-uuid-123');
  });

  test('throws BadRequestException when accepted true but messageId missing', () => {
    expect(() =>
      handleSendMessage({ accepted: true })
    ).toThrow(BadRequestException);
  });

  test('throws ForbiddenException when result error is NEED_AUTH', () => {
    expect(() =>
      handleSendMessage({ accepted: false, error: ERROR_CODE.NEED_AUTH })
    ).toThrow(ForbiddenException);
  });

  test('throws ConflictException when result error is AGENT_BUSY', () => {
    expect(() =>
      handleSendMessage({ accepted: false, error: ERROR_CODE.AGENT_BUSY })
    ).toThrow(ConflictException);
  });

  test('interrupted delivery exposes its original identity in the conflict response', () => {
    try {
      handleSendMessage({ accepted: false, error: 'REQUEST_OUTCOME_UNKNOWN', messageId: 'original-id' });
      throw new Error('expected conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual({ error: 'REQUEST_OUTCOME_UNKNOWN', messageId: 'original-id' });
    }
    expect(handleSendMessage({ accepted: true, messageId: 'original-id', executionState: 'failed' }))
      .toEqual({ accepted: true, messageId: 'original-id', executionState: 'failed' });
  });

  test('throws BadRequestException when result has other error', () => {
    expect(() =>
      handleSendMessage({ accepted: false, error: 'Unknown error' })
    ).toThrow(BadRequestException);
  });

  test('throws NotFoundException when conversation does not exist', () => {
    expect(() =>
      handleSendMessage({ accepted: false, error: 'Conversation not found' })
    ).toThrow(NotFoundException);
  });

  test('throws BadRequestException when result accepted false and no error', () => {
    expect(() => handleSendMessage({ accepted: false })).toThrow(
      BadRequestException
    );
  });
});
