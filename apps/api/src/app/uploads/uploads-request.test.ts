import { describe, expect, test } from 'bun:test';
import type { FastifyRequest } from 'fastify';
import { BadRequestException } from '@nestjs/common';
import { readMultipartUploadFile } from './uploads-request';

describe('readMultipartUploadFile', () => {
  test('returns a client error when the request has no multipart file', async () => {
    const req = {
      file: async () => {
        throw new Error('the request is not multipart');
      },
    } as unknown as FastifyRequest;

    await expect(readMultipartUploadFile(req)).rejects.toThrow(BadRequestException);
  });

  test('returns the parsed multipart file result', async () => {
    const file = {
      mimetype: 'image/png',
      toBuffer: async () => Buffer.from('png'),
    };
    const req = {
      file: async () => file,
    } as unknown as FastifyRequest;

    await expect(readMultipartUploadFile(req)).resolves.toBe(file);
  });
});
