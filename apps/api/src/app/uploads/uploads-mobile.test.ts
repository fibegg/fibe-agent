import { describe, test, expect } from 'bun:test';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

// Exercise the same parser limit as the application with the real upload handler.
describe('mobile upload HTTP policy', () => {
  test('retains metadata, blocks executable types, and rejects files over 20 MiB', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mobile-upload-'));
    const uploads = new UploadsService({ getConversationDataDir: () => dir } as never);
    const controller = new UploadsController(uploads);
    const server = Fastify();
    await server.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
    server.post('/api/uploads', request => controller.uploadFile(request, 'default'));
    const upload = (mime: string, content: Buffer) => server.inject({
      method: 'POST', url: '/api/uploads', headers: { 'content-type': 'multipart/form-data; boundary=mobile-test' },
      payload: Buffer.concat([Buffer.from(`--mobile-test\r\nContent-Disposition: form-data; name="file"; filename="My report.pdf"\r\nContent-Type: ${mime}\r\n\r\n`), content, Buffer.from('\r\n--mobile-test--\r\n')]),
    });
    try {
      const accepted = await upload('application/pdf', Buffer.from('example'));
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json()).toMatchObject({ originalFilename: 'My report.pdf', mediaType: 'application/pdf', size: 7, kind: 'document' });
      expect(new UploadsService({ getConversationDataDir: () => dir } as never).getAttachmentMetadata(accepted.json().filename).originalFilename).toBe('My report.pdf');
      const blocked = await upload('application/x-executable', Buffer.from('fake'));
      expect(blocked.statusCode).toBe(400);
      const tooLarge = await upload('application/pdf', Buffer.alloc(20 * 1024 * 1024 + 1));
      expect(tooLarge.statusCode).toBe(413);
    } finally {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
