import { Injectable, Logger } from '@nestjs/common';
import { UploadsService } from '../uploads/uploads.service';
import { PlaygroundsService } from '../playgrounds/playgrounds.service';

@Injectable()
export class ChatPromptContextService {
  private readonly logger = new Logger(ChatPromptContextService.name);

  constructor(
    private readonly uploadsService: UploadsService,
    private readonly playgroundsService: PlaygroundsService,
  ) {}

  async buildFullPrompt(
    text: string,
    imageUrls: string[],
    audioFilename: string | null,
    attachmentFilenames: string[] | undefined,
  ): Promise<string> {
    const imageContext = await this.buildImageContext(imageUrls);
    const voiceContext = this.buildVoiceContext(audioFilename);
    const attachmentContext = this.buildAttachmentContext(attachmentFilenames ?? []);
    const fileContext = await this.buildFileContext(text);
    return `${fileContext}${imageContext}${voiceContext}${attachmentContext}\n${text}`.trim();
  }

  private async buildImageContext(imageUrls: string[]): Promise<string> {
    if (!imageUrls.length) return '';
    const strings: string[] = [];
    for (const f of imageUrls) {
      const p = this.uploadsService.getPath(f);
      if (!p) continue;
      
      let infoStr = `- ${p}\n`;
      const info = await this.uploadsService.extractImageInfo(f);
      if (info) {
        const dimensions = (info.width && info.height) ? `${info.width}x${info.height} pixels` : '';
        const format = info.format || '';
        const meta = [dimensions, format].filter(Boolean).join(' ');
        if (meta) {
          infoStr += `  Metadata: ${meta}\n`;
        }
        if (info.text) {
          infoStr += `  Extracted Text:\n  ---\n  ${info.text.split('\\n').join('\\n  ')}\n  ---\n`;
        }
      }
      strings.push(infoStr);
    }
    return strings.length
      ? `\\n\\nThe user attached ${strings.length} image(s). Full paths and extracted local data (for reference):\\n${strings.join('\\n')}\\n`
      : '';
  }

  private buildVoiceContext(audioFilename: string | null): string {
    if (!audioFilename) return '';
    const path = this.uploadsService.getPath(audioFilename);
    return path ? `\n\nThe user attached a voice recording. File path: ${path}\n\n` : '';
  }

  private buildAttachmentContext(attachmentFilenames: string[]): string {
    if (!attachmentFilenames.length) return '';
    const paths = attachmentFilenames
      .map((f) => this.uploadsService.getPath(f))
      .filter((p): p is string => p !== null);
    return paths.length > 0
      ? `\n\nThe user attached ${paths.length} file(s). Full paths (for reference):\n${paths.map((p) => `- ${p}`).join('\n')}\n\n`
      : '';
  }

  private async buildFileContext(text: string): Promise<string> {
    const atPathRegex = /@([^\s@]+)/g;
    const atPaths = [...new Set((text.match(atPathRegex) ?? []).map((m) => m.slice(1)))];
    if (!atPaths.length) return '';
    const blocks: string[] = [];
    for (const relPath of atPaths) {
      try {
        const content = await this.playgroundsService.getFileContent(relPath);
        blocks.push(`--- ${relPath} ---\n${content}\n---`);
      } catch {
        try {
          const files = await this.playgroundsService.getFolderFileContents(relPath);
          for (const { path: p, content } of files) {
            blocks.push(`--- ${p} ---\n${content}\n---`);
          }
        } catch {
          this.logger.warn(`Playground file or folder not found: ${relPath}`);
        }
      }
    }
    return blocks.length
      ? `\n\nThe user referenced the following playground file(s)/folder(s). Contents:\n\n${blocks.join('\n\n')}\n\n`
      : '';
  }
}
