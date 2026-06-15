import { describe, expect, test } from 'bun:test';
import type { FastifyRequest } from 'fastify';
import { BadRequestException } from '@nestjs/common';
import { readMultipartUploadFile } from './uploads-request';

describe('readMultipartUploadFile', () => {
  test('returns a client error when the request is not multipart', async () => {
    let fileCalled = false;
    const req = {
      headers: { 'content-type': 'application/json' },
      isMultipart: () => false,
      file: async () => {
        fileCalled = true;
        throw new Error('should not be called');
      },
    } as unknown as FastifyRequest;

    await expect(readMultipartUploadFile(req)).rejects.toThrow(BadRequestException);
    expect(fileCalled).toBe(false);
  });

  test('returns a client error when multipart helper is unavailable', async () => {
    const req = {} as FastifyRequest;

    await expect(readMultipartUploadFile(req)).rejects.toThrow(BadRequestException);
  });

  test('returns a client error when multipart probing throws', async () => {
    let fileCalled = false;
    const req = {
      headers: { 'content-type': 'multipart/form-data; boundary=test' },
      isMultipart: () => {
        throw new Error('invalid multipart state');
      },
      file: async () => {
        fileCalled = true;
        throw new Error('should not be called');
      },
    } as unknown as FastifyRequest;

    await expect(readMultipartUploadFile(req)).rejects.toThrow(BadRequestException);
    expect(fileCalled).toBe(false);
  });

  test('returns a client error when the request has no multipart file', async () => {
    const req = {
      headers: { 'content-type': 'multipart/form-data; boundary=test' },
      isMultipart: () => true,
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
      headers: { 'content-type': 'multipart/form-data; boundary=test' },
      isMultipart: () => true,
      file: async () => file,
    } as unknown as FastifyRequest;

    await expect(readMultipartUploadFile(req)).resolves.toBe(file);
  });
});
