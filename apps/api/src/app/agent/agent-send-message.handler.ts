import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ERROR_CODE } from '../ws.constants';

export type SendMessageOrchestratorResult = {
  accepted: boolean;
  messageId?: string;
  error?: string;
};

export type SendMessageSuccess = { accepted: true; messageId: string };

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
    throw new BadRequestException(result.error ?? 'Unknown error');
  }
  if (result.messageId == null) {
    throw new BadRequestException('messageId missing');
  }
  return { accepted: true, messageId: result.messageId };
}
