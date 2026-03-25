import { describe, test, expect } from 'bun:test';
import { ChatPromptContextService } from './chat-prompt-context.service';

describe('ChatPromptContextService', () => {
  test('buildFullPrompt returns trimmed text when no context', async () => {
    const uploads = { getPath: () => null, extractImageInfo: async () => null };
    const playgrounds = { getFileContent: async () => { throw new Error(); }, getFolderFileContents: async () => { throw new Error(); } };
    const service = new ChatPromptContextService(uploads as never, playgrounds as never);
    const result = await service.buildFullPrompt(' hello ', [], null, undefined);
    expect(result).toBe('hello');
  });

  test('buildFullPrompt includes image context when imageUrls have paths', async () => {
    const uploads = { 
      getPath: (f: string) => (f === 'img1' ? '/path/img1' : null),
      extractImageInfo: async (f: string) => (f === 'img1' ? { text: 'test text', width: 100, height: 100, format: 'png' } : null)
    };
    const playgrounds = { getFileContent: async () => { throw new Error(); }, getFolderFileContents: async () => { throw new Error(); } };
    const service = new ChatPromptContextService(uploads as never, playgrounds as never);
    const result = await service.buildFullPrompt('hi', ['img1'], null, undefined);
    expect(result).toContain('image(s)');
    expect(result).toContain('/path/img1');
    expect(result).toContain('hi');
  });

  test('buildFullPrompt includes voice context when audioFilename has path', async () => {
    const uploads = { 
      getPath: (f: string) => (f === 'voice.webm' ? '/uploads/voice.webm' : null),
      extractImageInfo: async () => null 
    };
    const playgrounds = { getFileContent: async () => { throw new Error(); }, getFolderFileContents: async () => { throw new Error(); } };
    const service = new ChatPromptContextService(uploads as never, playgrounds as never);
    const result = await service.buildFullPrompt('hi', [], 'voice.webm', undefined);
    expect(result).toContain('voice recording');
    expect(result).toContain('/uploads/voice.webm');
    expect(result).toContain('hi');
  });

  test('buildFullPrompt includes attachment context when attachmentFilenames have paths', async () => {
    const uploads = { 
      getPath: (f: string) => (f === 'doc.pdf' ? '/files/doc.pdf' : null),
      extractImageInfo: async () => null 
    };
    const playgrounds = { getFileContent: async () => { throw new Error(); }, getFolderFileContents: async () => { throw new Error(); } };
    const service = new ChatPromptContextService(uploads as never, playgrounds as never);
    const result = await service.buildFullPrompt('hi', [], null, ['doc.pdf']);
    expect(result).toContain('file(s)');
    expect(result).toContain('/files/doc.pdf');
    expect(result).toContain('hi');
  });

  test('buildFullPrompt includes file context when text has @path and getFileContent returns', async () => {
    const uploads = { getPath: () => null, extractImageInfo: async () => null };
    const playgrounds = {
      getFileContent: async (path: string) => (path === 'src/index.ts' ? 'const x = 1;' : ''),
      getFolderFileContents: async () => { throw new Error(); },
    };
    const service = new ChatPromptContextService(uploads as never, playgrounds as never);
    const result = await service.buildFullPrompt('see @src/index.ts', [], null, undefined);
    expect(result).toContain('referenced');
    expect(result).toContain('--- src/index.ts ---');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('see @src/index.ts');
  });

  test('buildFullPrompt ignores @ref when getFileContent and getFolderFileContents throw', async () => {
    const uploads = { getPath: () => null, extractImageInfo: async () => null };
    const playgrounds = { getFileContent: async () => { throw new Error(); }, getFolderFileContents: async () => { throw new Error(); } };
    const service = new ChatPromptContextService(uploads as never, playgrounds as never);
    const result = await service.buildFullPrompt('see @missing', [], null, undefined);
    expect(result).toBe('see @missing');
  });
});
