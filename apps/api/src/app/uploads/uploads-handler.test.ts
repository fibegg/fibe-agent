import { describe, test, expect } from 'bun:test';
import { BadRequestException } from '@nestjs/common';
import {
  processUploadFile,
  validateUploadMimetype,
  type MultipartFileResult,
} from './uploads-handler';

describe('validateUploadMimetype', () => {
  test('throws for non-audio mimetype', () => {
    expect(() => validateUploadMimetype('image/png')).toThrow(BadRequestException);
  });

  test('allows audio/* mimetypes', () => {
    expect(() => validateUploadMimetype('audio/webm')).not.toThrow();
    expect(() => validateUploadMimetype('audio/ogg')).not.toThrow();
    expect(() => validateUploadMimetype('audio/custom')).not.toThrow();
  });
});

describe('processUploadFile', () => {
  test('throws when no file', async () => {
    await expect(processUploadFile(undefined, () => 'x.webm')).rejects.toThrow(
      BadRequestException
    );
  });

  test('throws when mimetype not audio', async () => {
    const fileResult: MultipartFileResult = {
      mimetype: 'image/png',
      toBuffer: async () => Buffer.from(''),
    };
    await expect(processUploadFile(fileResult, () => 'x.webm')).rejects.toThrow(
      BadRequestException
    );
  });

  test('returns filename for valid audio', async () => {
    const fileResult: MultipartFileResult = {
      mimetype: 'audio/webm',
      toBuffer: async () => Buffer.from(''),
    };
    const result = await processUploadFile(fileResult, () => 'saved.webm');
    expect(result).toEqual({ filename: 'saved.webm' });
  });
});
