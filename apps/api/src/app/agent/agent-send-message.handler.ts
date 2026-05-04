import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ERROR_CODE } from '@shared/ws-constants';

export type SendMessageOrchestratorResult = {
  accepted: boolean;
  messageId?: string;
  error?: string;
  resolvedPolicy?: string;
};

export type SendMessageSuccess = { accepted: true; messageId: string; resolvedPolicy?: string };

export function handleSendMessage(
  result: SendMessageOrchestratorResult
): SendMessageSuccess {
  if (!result.accepted) {
    if (result.error === ERROR_CODE.NEED_AUTH) {
      throw new ForbiddenException(ERROR_CODE.NEED_AUTH);
    }
    if (result.error === ERROR_CODE.AGENT_BUSY) {
      throw new ConflictException(ERROR_CODE.AGENT_BUSY);
    }
    if (result.error === 'Conversation not found') {
      throw new NotFoundException('Conversation not found');
    }
    throw new BadRequestException(result.error ?? 'Unknown error');
  }
  if (result.messageId == null) {
    throw new BadRequestException('messageId missing');
  }
  return {
    accepted: true,
    messageId: result.messageId,
    ...(result.resolvedPolicy ? { resolvedPolicy: result.resolvedPolicy } : {}),
  };
}
