import { describe, test, expect } from 'bun:test';
import { HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { GlobalHttpExceptionFilter } from './http-exception.filter';

function createMockHost(sendFn: (payload: unknown) => void) {
  const reply = {
    statusCode: 0,
    sentPayload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.sentPayload = payload;
      sendFn(payload);
      return this;
    },
  };
  return {
    switchToHttp: () => ({
      getResponse: () => reply,
    }),
    reply,
  };
}

describe('GlobalHttpExceptionFilter', () => {
  const filter = new GlobalHttpExceptionFilter();

  test('handles HttpException with string response', () => {
    const host = createMockHost(() => { return; });
    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);
    filter.catch(exception, host as never);
    expect(host.reply.statusCode).toBe(404);
    expect(host.reply.sentPayload).toMatchObject({
      statusCode: 404,
      message: 'Not found',
    });
  });

  test('handles HttpException with object response containing message string', () => {
    const host = createMockHost(() => { return; });
    const exception = new BadRequestException('Invalid input');
    filter.catch(exception, host as never);
    expect(host.reply.statusCode).toBe(400);
    expect((host.reply.sentPayload as { message: string }).message).toBe('Invalid input');
  });

  test('handles HttpException with message array (validation)', () => {
    const host = createMockHost(() => { return; });
    const exception = new BadRequestException({ message: ['field is required', 'field must be string'] });
    filter.catch(exception, host as never);
    expect(host.reply.statusCode).toBe(400);
    expect((host.reply.sentPayload as { message: string }).message).toBe('field is required');
  });

  test('handles unknown exceptions with 500 and generic message', () => {
    const host = createMockHost(() => { return; });
    filter.catch(new Error('something broke'), host as never);
    expect(host.reply.statusCode).toBe(500);
    expect((host.reply.sentPayload as { message: string }).message).toBe('Internal server error');
    expect((host.reply.sentPayload as { error: string }).error).toBe('Internal Server Error');
  });

  test('handles non-Error exceptions', () => {
    const host = createMockHost(() => { return; });
    filter.catch('string error', host as never);
    expect(host.reply.statusCode).toBe(500);
    expect((host.reply.sentPayload as { message: string }).message).toBe('Internal server error');
  });

  test('includes error name in payload', () => {
    const host = createMockHost(() => { return; });
    const exception = new BadRequestException('bad');
    filter.catch(exception, host as never);
    expect((host.reply.sentPayload as { error: string }).error).toBe('BadRequestException');
  });
});
