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
  'application/zip',
  'application/x-zip-compressed',
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
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
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

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  pdf: 'application/pdf',
  zip: 'application/zip',
  json: 'application/json',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  html: 'text/html',
  rtf: 'application/rtf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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

export function contentTypeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || '';
  return EXT_TO_MIME[ext] || 'application/octet-stream';
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
