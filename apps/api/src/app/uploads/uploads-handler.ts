import { BadRequestException } from '@nestjs/common';

const AUDIO_MIMES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
]);

const ALLOWED_MIME_PREFIXES = new Set([
  'image/',
  'audio/',
  'text/',
  'application/pdf',
  'application/json',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.',
  'application/rtf',
]);

const BLOCKED_MIME_SUBSTRINGS = [
  'application/x-msdownload',
  'application/x-msi',
  'application/x-executable',
  'application/x-sh',
  'application/x-shellscript',
  'application/javascript',
  'text/javascript',
  'application/x-bat',
  'application/x-csh',
  'application/vnd.microsoft.portable-executable',
];

const MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
  'application/json': 'json',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'text/html': 'html',
  'application/rtf': 'rtf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export type MultipartFileResult = { mimetype: string; toBuffer: () => Promise<Buffer> } | undefined;

function isAllowedMimetype(mimetype: string): boolean {
  const normalized = mimetype.split(';')[0].trim().toLowerCase();
  if (BLOCKED_MIME_SUBSTRINGS.some((s) => normalized.includes(s))) return false;
  if (AUDIO_MIMES.has(mimetype) || normalized.startsWith('audio/')) return true;
  if (normalized.startsWith('image/')) return true;
  if (normalized.startsWith('text/')) return true;
  for (const prefix of ALLOWED_MIME_PREFIXES) {
    if (prefix.endsWith('.') && normalized.startsWith(prefix)) return true;
    if (normalized === prefix || normalized.startsWith(prefix)) return true;
  }
  return false;
}

export function validateUploadMimetype(mimetype: string): void {
  if (!mimetype || !isAllowedMimetype(mimetype)) {
    throw new BadRequestException('Unsupported or blocked file type');
  }
}

export function extFromMimetype(mimetype: string): string {
  const normalized = mimetype.split(';')[0].trim().toLowerCase();
  const exact = MIME_TO_EXT[normalized];
  if (exact) return exact;
  if (normalized.startsWith('image/')) {
    const sub = normalized.replace('image/', '');
    return sub === 'jpeg' ? 'jpg' : sub;
  }
  if (normalized.startsWith('audio/')) {
    if (normalized.includes('webm')) return 'webm';
    if (normalized.includes('ogg')) return 'ogg';
    if (normalized.includes('mp4')) return 'm4a';
    return 'webm';
  }
  return 'bin';
}

export async function processUploadFile(
  fileResult: MultipartFileResult,
  saveFromBuffer: (buffer: Buffer, mimetype: string) => string | Promise<string>
): Promise<{ filename: string }> {
  if (!fileResult) throw new BadRequestException('No file uploaded');
  const mimetype = fileResult.mimetype ?? 'application/octet-stream';
  validateUploadMimetype(mimetype);
  const buffer = await fileResult.toBuffer();
  const filename = await saveFromBuffer(buffer, mimetype);
  return { filename };
}
