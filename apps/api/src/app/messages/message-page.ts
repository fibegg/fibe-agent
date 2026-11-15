import { BadRequestException } from '@nestjs/common';

export const MESSAGE_PAGE_MAX_LIMIT = 500;

const LIMIT_ERROR = `limit must be an integer from 1 to ${MESSAGE_PAGE_MAX_LIMIT}`;
const BEFORE_ERROR = 'before must be a message id';

export interface MessagePageQuery {
  /** Newest `limit` messages of the selected range; all of them when absent. */
  limit?: number;
  /** Only messages stored before this message id. */
  before?: string;
}

export interface MessagePage<T> {
  messages: T[];
  /** True when older messages exist before the first returned message. */
  hasMore: boolean;
}

/**
 * Parses the optional `limit` / `before` query values of a message history
 * request. Returns null when neither is present (the full-history response).
 * Throws 400 for an invalid value.
 */
export function parseMessagePageQuery(
  rawLimit: unknown,
  rawBefore: unknown,
): MessagePageQuery | null {
  if (rawLimit === undefined && rawBefore === undefined) return null;
  const query: MessagePageQuery = {};
  if (rawLimit !== undefined) {
    if (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit)) {
      throw new BadRequestException(LIMIT_ERROR);
    }
    const limit = Number(rawLimit);
    if (limit < 1 || limit > MESSAGE_PAGE_MAX_LIMIT) {
      throw new BadRequestException(LIMIT_ERROR);
    }
    query.limit = limit;
  }
  if (rawBefore !== undefined) {
    if (typeof rawBefore !== 'string' || rawBefore === '') {
      throw new BadRequestException(BEFORE_ERROR);
    }
    query.before = rawBefore;
  }
  return query;
}

/**
 * Selects a chronological page from stored messages (oldest first): the newest
 * `limit` messages, or those immediately before `before`. Returns null when
 * `before` names no stored message.
 */
export function sliceMessagePage<T extends { id: string }>(
  messages: T[],
  query: MessagePageQuery,
): MessagePage<T> | null {
  let end = messages.length;
  if (query.before !== undefined) {
    end = messages.findIndex((message) => message.id === query.before);
    if (end < 0) return null;
  }
  const start = query.limit === undefined ? 0 : Math.max(0, end - query.limit);
  return { messages: messages.slice(start, end), hasMore: start > 0 };
}
