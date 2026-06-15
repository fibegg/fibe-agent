import type { FastifyRequest } from 'fastify';
import { BadRequestException } from '@nestjs/common';
import type { MultipartFileResult } from './uploads-handler';

export async function readMultipartUploadFile(req: FastifyRequest): Promise<MultipartFileResult> {
  const multipartRequest = req as unknown as {
    headers?: FastifyRequest['headers'];
    file?: () => Promise<MultipartFileResult>;
    isMultipart?: () => boolean;
  };

  if (typeof multipartRequest.file !== 'function' || !isMultipartUploadRequest(multipartRequest)) {
    throw new BadRequestException('No file uploaded');
  }

  try {
    const file = await multipartRequest.file();
    if (!file) throw new Error('No file uploaded');
    return file;
  } catch {
    throw new BadRequestException('No file uploaded');
  }
}

function isMultipartUploadRequest(req: { headers?: FastifyRequest['headers']; isMultipart?: () => boolean }): boolean {
  if (!hasMultipartContentType(req.headers)) return false;

  try {
    return req.isMultipart?.() !== false;
  } catch {
    return false;
  }
}

function hasMultipartContentType(headers: FastifyRequest['headers'] | undefined): boolean {
  const header = headers?.['content-type'];
  const values = Array.isArray(header) ? header : [header];
  return values.some((value) => typeof value === 'string' && value.toLowerCase().includes('multipart/form-data'));
}
