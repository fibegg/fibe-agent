import type { FastifyRequest } from 'fastify';
import { BadRequestException } from '@nestjs/common';
import type { MultipartFileResult } from './uploads-handler';

export async function readMultipartUploadFile(req: FastifyRequest): Promise<MultipartFileResult> {
  const multipartRequest = req as unknown as {
    file?: () => Promise<MultipartFileResult>;
    isMultipart?: () => boolean;
  };
  if (typeof multipartRequest.file !== 'function' || multipartRequest.isMultipart?.() === false) {
    throw new BadRequestException('No file uploaded');
  }

  try {
    return await multipartRequest.file();
  } catch {
    throw new BadRequestException('No file uploaded');
  }
}
