import type { FastifyRequest } from 'fastify';
import { BadRequestException } from '@nestjs/common';
import type { MultipartFileResult } from './uploads-handler';

export async function readMultipartUploadFile(req: FastifyRequest): Promise<MultipartFileResult> {
  try {
    return await (req as unknown as { file: () => Promise<MultipartFileResult> }).file();
  } catch {
    throw new BadRequestException('No file uploaded');
  }
}
