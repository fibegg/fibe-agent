import { describe, test, expect } from 'bun:test';
import { BadRequestException } from '@nestjs/common';
import {
  MESSAGE_PAGE_MAX_LIMIT,
  parseMessagePageQuery,
  sliceMessagePage,
} from './message-page';

const messages = ['m1', 'm2', 'm3', 'm4', 'm5'].map((id) => ({ id }));
const ids = (page: { messages: { id: string }[] } | null) =>
  page?.messages.map((m) => m.id);

describe('parseMessagePageQuery', () => {
  test('returns null without paging parameters', () => {
    expect(parseMessagePageQuery(undefined, undefined)).toBeNull();
  });

  test('parses limit and before', () => {
    expect(parseMessagePageQuery('20', undefined)).toEqual({ limit: 20 });
    expect(parseMessagePageQuery('1', 'm3')).toEqual({ limit: 1, before: 'm3' });
    expect(parseMessagePageQuery(String(MESSAGE_PAGE_MAX_LIMIT), undefined)).toEqual({
      limit: MESSAGE_PAGE_MAX_LIMIT,
    });
    expect(parseMessagePageQuery(undefined, 'm3')).toEqual({ before: 'm3' });
  });

  test.each(['0', '501', '2.5', '-1', '+5', '1e2', 'abc', '', ' 5', '99999999999999999999'])(
    'rejects limit %p',
    (limit) => {
      expect(() => parseMessagePageQuery(limit, undefined)).toThrow(BadRequestException);
    },
  );

  test('rejects repeated or empty values', () => {
    expect(() => parseMessagePageQuery(['1', '2'], undefined)).toThrow(BadRequestException);
    expect(() => parseMessagePageQuery(undefined, ['m1', 'm2'])).toThrow(BadRequestException);
    expect(() => parseMessagePageQuery(undefined, '')).toThrow(BadRequestException);
  });
});

describe('sliceMessagePage', () => {
  test('returns the newest messages in chronological order', () => {
    const page = sliceMessagePage(messages, { limit: 2 });
    expect(ids(page)).toEqual(['m4', 'm5']);
    expect(page?.hasMore).toBe(true);
  });

  test('returns everything when limit covers the history', () => {
    const page = sliceMessagePage(messages, { limit: 5 });
    expect(ids(page)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(page?.hasMore).toBe(false);
  });

  test('returns the messages immediately before a message id', () => {
    const page = sliceMessagePage(messages, { limit: 2, before: 'm4' });
    expect(ids(page)).toEqual(['m2', 'm3']);
    expect(page?.hasMore).toBe(true);

    const first = sliceMessagePage(messages, { limit: 10, before: 'm3' });
    expect(ids(first)).toEqual(['m1', 'm2']);
    expect(first?.hasMore).toBe(false);
  });

  test('returns an empty page before the oldest message', () => {
    expect(sliceMessagePage(messages, { limit: 3, before: 'm1' })).toEqual({
      messages: [],
      hasMore: false,
    });
  });

  test('returns all earlier messages for before without limit', () => {
    const page = sliceMessagePage(messages, { before: 'm4' });
    expect(ids(page)).toEqual(['m1', 'm2', 'm3']);
    expect(page?.hasMore).toBe(false);
  });

  test('returns null for an unknown before id', () => {
    expect(sliceMessagePage(messages, { limit: 2, before: 'missing' })).toBeNull();
  });
});
