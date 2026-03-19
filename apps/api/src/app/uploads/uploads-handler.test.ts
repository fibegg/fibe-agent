import { describe, test, expect } from 'bun:test';
import { BadRequestException } from '@nestjs/common';
import {
  processUploadFile,
  validateUploadMimetype,
  extFromMimetype,
  type MultipartFileResult,
} from './uploads-handler';

describe('validateUploadMimetype', () => {
  test('allows image mimetypes', () => {
    expect(() => validateUploadMimetype('image/png')).not.toThrow();
    expect(() => validateUploadMimetype('image/jpeg')).not.toThrow();
  });

  test('allows audio mimetypes', () => {
    expect(() => validateUploadMimetype('audio/webm')).not.toThrow();
    expect(() => validateUploadMimetype('audio/ogg')).not.toThrow();
    expect(() => validateUploadMimetype('audio/custom')).not.toThrow();
  });

  test('allows document mimetypes', () => {
    expect(() => validateUploadMimetype('application/pdf')).not.toThrow();
    expect(() => validateUploadMimetype('text/plain')).not.toThrow();
    expect(() => validateUploadMimetype('text/csv')).not.toThrow();
    expect(() =>
      validateUploadMimetype('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    ).not.toThrow();
  });

  test('throws for blocked mimetype', () => {
    expect(() => validateUploadMimetype('application/x-msdownload')).toThrow(BadRequestException);
  });

  test('throws for unknown mimetype', () => {
    expect(() => validateUploadMimetype('application/x-foo-bar')).toThrow(BadRequestException);
  });
});

describe('extFromMimetype', () => {
  test('returns correct ext for known types', () => {
    expect(extFromMimetype('application/pdf')).toBe('pdf');
    expect(extFromMimetype('text/plain')).toBe('txt');
    expect(extFromMimetype('image/jpeg')).toBe('jpg');
    expect(extFromMimetype('image/png')).toBe('png');
  });
});

describe('processUploadFile', () => {
  test('throws when no file', async () => {
    await expect(processUploadFile(undefined, () => 'x.webm')).rejects.toThrow(
      BadRequestException
    );
  });

  test('throws when mimetype blocked', async () => {
    const fileResult: MultipartFileResult = {
      mimetype: 'application/x-msdownload',
      toBuffer: async () => Buffer.from(''),
    };
    await expect(
      processUploadFile(fileResult, () => 'x.webm')
    ).rejects.toThrow(BadRequestException);
  });

  test('returns filename for valid audio', async () => {
    const fileResult: MultipartFileResult = {
      mimetype: 'audio/webm',
      toBuffer: async () => Buffer.from(''),
    };
    const result = await processUploadFile(fileResult, () => 'saved.webm');
    expect(result).toEqual({ filename: 'saved.webm' });
  });

  test('returns filename for valid image', async () => {
    const fileResult: MultipartFileResult = {
      mimetype: 'image/png',
      toBuffer: async () => Buffer.from(''),
    };
    const result = await processUploadFile(fileResult, () => 'saved.png');
    expect(result).toEqual({ filename: 'saved.png' });
  });
});
