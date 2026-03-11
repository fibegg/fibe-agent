import { BadRequestException } from '@nestjs/common';

const AUDIO_MIMES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
]);

export type MultipartFileResult = { mimetype: string; toBuffer: () => Promise<Buffer> } | undefined;

export function validateUploadMimetype(mimetype: string): void {
  if (!AUDIO_MIMES.has(mimetype) && !mimetype.startsWith('audio/')) {
    throw new BadRequestException('Unsupported file type');
  }
}

export async function processUploadFile(
  fileResult: MultipartFileResult,
  saveAudioFromBuffer: (buffer: Buffer, mimetype: string) => string
): Promise<{ filename: string }> {
  if (!fileResult) throw new BadRequestException('No file uploaded');
  const mimetype = fileResult.mimetype ?? 'audio/webm';
  validateUploadMimetype(mimetype);
  const buffer = await fileResult.toBuffer();
  const filename = saveAudioFromBuffer(buffer, mimetype);
  return { filename };
}
