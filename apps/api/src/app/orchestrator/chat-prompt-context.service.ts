import { Injectable, Logger } from '@nestjs/common';
import { UploadsService } from '../uploads/uploads.service';
import { PlaygroundsService } from '../playgrounds/playgrounds.service';

/** Max number of prior messages to inject into the prompt for history context. */
const MAX_HISTORY_MESSAGES = 50;
/** Max total characters for history block to avoid blowing up the context window. */
const MAX_HISTORY_CHARS = 30_000;

export interface HistoryMessage {
  role: string;
  body: string;
}

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
    historyMessages?: HistoryMessage[],
    conversationId?: string,
  ): Promise<string> {
    const historyContext = this.buildHistoryContext(historyMessages);
    const imageContext = await this.buildImageContext(imageUrls, conversationId);
    const voiceContext = this.buildVoiceContext(audioFilename, conversationId);
    const attachmentContext = await this.buildAttachmentContext(attachmentFilenames ?? [], conversationId);
    const fileContext = await this.buildFileContext(text);
    return `${historyContext}${fileContext}${imageContext}${voiceContext}${attachmentContext}\n${text}`.trim();
  }

  buildHistoryContext(messages?: HistoryMessage[]): string {
    if (!messages?.length) return '';
    const recent = messages.slice(-MAX_HISTORY_MESSAGES);
    const lines: string[] = [];
    let totalChars = 0;
    for (const msg of recent) {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      const body = msg.body.length > 2000 ? msg.body.slice(0, 2000) + '…' : msg.body;
      const line = `${role}: ${body}`;
      if (totalChars + line.length > MAX_HISTORY_CHARS) break;
      lines.push(line);
      totalChars += line.length;
    }
    if (!lines.length) return '';
    return `\n\n[Conversation History — ${lines.length} prior messages]\n${lines.join('\n')}\n[End of Conversation History]\n\n`;
  }

  /**
   * Prepends a system-level MCP tool hint block to the user message text.
   * This is injected only when GemmaRouter returns a high-confidence suggestion.
   * The stored chat history is never affected — only the built prompt changes.
   */
  injectToolHint(text: string, tools: string[], confidence: number): string {
    if (!tools.length) return text;
    const recommended_tools = tools.map((name) => ({ name, confidence }));
    const hint = `[FIBE]${JSON.stringify({ recommended_tools })}[/FIBE]`;
    return `${hint}\n${text}`;
  }

  /**
   * Prepends the current operator mode to the prompt text.
   * This is injected on every request so the agent CLI knows what mode it's operating in.
   * Example: "[MODE]Casting...[/MODE]\n<user message>"
   */
  injectModeHint(text: string, mode: string): string {
    if (!mode) return text;
    return `[MODE]${mode}[/MODE]\n${text}`;
  }

  private async buildImageContext(imageUrls: string[], conversationId?: string): Promise<string> {
    if (!imageUrls.length) return '';
    const strings: string[] = [];
    for (const f of imageUrls) {
      const p = this.uploadsService.getPath(f, conversationId);
      if (!p) continue;
      
      let infoStr = `- ${p}\n`;
      if (!this.uploadsService.supportsImageOcr(f)) {
        infoStr += '  OCR: unavailable for this image format; visual reference only.\n';
        strings.push(infoStr);
        continue;
      }

      const info = await this.uploadsService.extractImageInfo(f, conversationId);
      if (info) {
        const dimensions = (info.width && info.height) ? `${info.width}x${info.height} pixels` : '';
        const format = info.format || '';
        const meta = [dimensions, format].filter(Boolean).join(' ');
        if (meta) {
          infoStr += `  Metadata: ${meta}\n`;
        }
        if (info.text) {
          infoStr += `  Extracted Text:\n  ---\n  ${info.text.split('\n').join('\n  ')}\n  ---\n`;
        }
      } else {
        infoStr += '  OCR: unavailable; visual reference only.\n';
      }
      strings.push(infoStr);
    }
    return strings.length
      ? `\n\nThe user attached ${strings.length} image(s). Use these as visual reference material for the request. Full paths and extracted local data:\n${strings.join('\n')}\n`
      : '';
  }

  private buildVoiceContext(audioFilename: string | null, conversationId?: string): string {
    if (!audioFilename) return '';
    const path = this.uploadsService.getPath(audioFilename, conversationId);
    return path ? `\n\nThe user attached a voice recording. File path: ${path}\n\n` : '';
  }

  private async buildAttachmentContext(attachmentFilenames: string[], conversationId?: string): Promise<string> {
    if (!attachmentFilenames.length) return '';
    const entries: string[] = [];
    for (const filename of attachmentFilenames) {
      const path = this.uploadsService.getPath(filename, conversationId);
      if (!path) continue;
      if (!this.isImageFilename(filename)) {
        entries.push(`- ${path}`);
        continue;
      }
      let entry = `- ${path}\n  Type: image visual reference. Inspect this file when visual details matter.`;
      if (!this.uploadsService.supportsImageOcr(filename)) {
        entry += '\n  OCR: unavailable for this image format; visual reference only.';
        entries.push(entry);
        continue;
      }

      const info = await this.uploadsService.extractImageInfo(filename, conversationId);
      if (info) {
        const dimensions = (info.width && info.height) ? `${info.width}x${info.height} pixels` : '';
        const format = info.format || '';
        const meta = [dimensions, format].filter(Boolean).join(' ');
        if (meta) {
          entry += `\n  Metadata: ${meta}`;
        }
        if (info.text) {
          entry += `\n  Extracted Text:\n  ---\n  ${info.text.split('\n').join('\n  ')}\n  ---`;
        }
      } else {
        entry += '\n  OCR: unavailable; visual reference only.';
      }
      entries.push(entry);
    }
    return entries.length > 0
      ? `\n\nThe user attached ${entries.length} file(s). Use them as request context. Image files are visual references, not missing prompt artefacts. Full paths:\n${entries.join('\n')}\n\n`
      : '';
  }

  private isImageFilename(filename: string): boolean {
    return /\.(avif|bmp|gif|heic|heif|jpe?g|png|tiff?|webp)$/i.test(filename);
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
