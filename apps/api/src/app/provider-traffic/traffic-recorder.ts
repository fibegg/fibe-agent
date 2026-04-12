import { randomUUID } from 'node:crypto';
import type { CapturedProviderRequest, ProviderName } from './types';
import { sanitizeHeaders, resolveProvider, DEFAULT_MAX_BODY_SIZE } from './types';

/**
 * Records a single HTTP request-response pair flowing through a decrypted
 * TLS tunnel. Bytes are fed in from each direction; when the connection
 * closes the assembled {@link CapturedProviderRequest} is emitted via the
 * `onComplete` callback.
 */
export class TrafficRecorder {
  private readonly id = randomUUID();
  private readonly startTime = Date.now();
  private readonly maxBodySize: number;
  private readonly redactBodies: boolean;

  // --- request side ---
  private reqHeadersDone = false;
  private reqHeaderBuf = '';
  private reqMethod = '';
  private reqUrl = '';
  private reqHeaders: Record<string, string> = {};
  private reqBody = '';
  private reqBodyTruncated = false;
  private reqBodyBytesRead = 0;
  private reqChunked = false;
  private reqChunkState: ChunkParseState = { phase: 'size', sizeBuf: '', remaining: 0 };

  // --- response side ---
  private resHeadersDone = false;
  private resHeaderBuf = '';
  private resStatusCode = 0;
  private resStatusMessage = '';
  private resHeaders: Record<string, string> = {};
  private resBody = '';
  private resBodyTruncated = false;
  private resBodyBytesRead = 0;
  private resChunked = false;
  private resChunkState: ChunkParseState = { phase: 'size', sizeBuf: '', remaining: 0 };

  private bytesSent = 0;
  private bytesReceived = 0;
  private error: string | null = null;
  private completed = false;

  constructor(
    private readonly hostname: string,
    private readonly port: number,
    private readonly onComplete: (record: CapturedProviderRequest) => void,
    options?: { maxBodySize?: number; redactBodies?: boolean }
  ) {
    this.maxBodySize = options?.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
    this.redactBodies = options?.redactBodies ?? false;
  }

  /** Feed bytes sent by the client (CLI) toward the server (provider). */
  feedRequest(data: Buffer): void {
    this.bytesSent += data.length;
    const str = data.toString('utf-8');

    if (!this.reqHeadersDone) {
      this.reqHeaderBuf += str;
      const headerEnd = this.reqHeaderBuf.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      const headerSection = this.reqHeaderBuf.slice(0, headerEnd);
      const bodyStart = this.reqHeaderBuf.slice(headerEnd + 4);
      this.parseRequestHeaders(headerSection);
      this.reqHeadersDone = true;

      if (bodyStart.length > 0) this.appendReqBody(bodyStart);
    } else {
      this.appendReqBody(str);
    }
  }

  /** Feed bytes received from the server (provider) toward the client (CLI). */
  feedResponse(data: Buffer): void {
    this.bytesReceived += data.length;
    const str = data.toString('utf-8');

    if (!this.resHeadersDone) {
      this.resHeaderBuf += str;
      const headerEnd = this.resHeaderBuf.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      const headerSection = this.resHeaderBuf.slice(0, headerEnd);
      const bodyStart = this.resHeaderBuf.slice(headerEnd + 4);
      this.parseResponseHeaders(headerSection);
      this.resHeadersDone = true;

      if (bodyStart.length > 0) this.appendResBody(bodyStart);
    } else {
      this.appendResBody(str);
    }
  }

  /** Signal that the connection has ended (either normally or due to error). */
  end(errorMsg?: string): void {
    if (this.completed) return;
    this.completed = true;
    if (errorMsg) this.error = errorMsg;

    const isStreaming =
      (this.resHeaders['content-type'] ?? '').includes('text/event-stream') ||
      this.resChunked;

    const provider: ProviderName = resolveProvider(this.hostname);
    const scheme = this.port === 443 ? 'https' : 'http';

    const record: CapturedProviderRequest = {
      id: this.id,
      timestamp: new Date(this.startTime).toISOString(),
      provider,
      request: {
        method: this.reqMethod || 'UNKNOWN',
        url: `${scheme}://${this.hostname}${this.reqUrl}`,
        headers: sanitizeHeaders(this.reqHeaders),
        body: this.redactBodies ? '[REDACTED]' : this.reqBody || null,
        bodyTruncated: this.reqBodyTruncated,
      },
      response: {
        statusCode: this.resStatusCode,
        statusMessage: this.resStatusMessage,
        headers: sanitizeHeaders(this.resHeaders),
        body: this.redactBodies ? '[REDACTED]' : this.resBody || null,
        bodyTruncated: this.resBodyTruncated,
      },
      durationMs: Date.now() - this.startTime,
      bytesReceived: this.bytesReceived,
      bytesSent: this.bytesSent,
      isStreaming,
      error: this.error,
      usage: this.extractUsage(),
    };

    this.onComplete(record);
  }

  // ── Header parsing ─────────────────────────────────────────────

  private parseRequestHeaders(raw: string): void {
    const lines = raw.split('\r\n');
    const [method, path] = (lines[0] ?? '').split(' ');
    this.reqMethod = method ?? '';
    this.reqUrl = path ?? '';
    this.reqHeaders = parseHeaderLines(lines.slice(1));
    this.reqChunked = (this.reqHeaders['transfer-encoding'] ?? '').toLowerCase().includes('chunked');
  }

  private parseResponseHeaders(raw: string): void {
    const lines = raw.split('\r\n');
    const statusLine = lines[0] ?? '';
    const match = statusLine.match(/^HTTP\/\d\.\d\s+(\d+)\s*(.*)/);
    this.resStatusCode = match ? parseInt(match[1], 10) : 0;
    this.resStatusMessage = match?.[2] ?? '';
    this.resHeaders = parseHeaderLines(lines.slice(1));
    this.resChunked = (this.resHeaders['transfer-encoding'] ?? '').toLowerCase().includes('chunked');
  }

  // ── Body accumulation ──────────────────────────────────────────

  private appendReqBody(data: string): void {
    if (this.reqBodyTruncated) return;
    if (this.reqChunked) {
      this.reqBody += dechunk(data, this.reqChunkState);
    } else {
      this.reqBody += data;
    }
    this.reqBodyBytesRead += Buffer.byteLength(data, 'utf-8');
    if (this.reqBodyBytesRead > this.maxBodySize) {
      this.reqBody = this.reqBody.slice(0, this.maxBodySize);
      this.reqBodyTruncated = true;
    }
  }

  private appendResBody(data: string): void {
    if (this.resBodyTruncated) return;
    if (this.resChunked) {
      this.resBody += dechunk(data, this.resChunkState);
    } else {
      this.resBody += data;
    }
    this.resBodyBytesRead += Buffer.byteLength(data, 'utf-8');
    if (this.resBodyBytesRead > this.maxBodySize) {
      this.resBody = this.resBody.slice(0, this.maxBodySize);
      this.resBodyTruncated = true;
    }
  }

  // ── Usage extraction ───────────────────────────────────────────

  private extractUsage(): CapturedProviderRequest['usage'] | undefined {
    const body = this.resBody;
    if (!body) return undefined;

    try {
      const provider = resolveProvider(this.hostname);

      if (provider === 'anthropic') {
        return this.extractAnthropicUsage(body);
      }
      if (provider === 'openai' || provider === 'openrouter') {
        return this.extractOpenAIUsage(body);
      }
      if (provider === 'google') {
        return this.extractGoogleUsage(body);
      }
    } catch {
      // non-critical — skip usage extraction
    }
    return undefined;
  }

  private extractAnthropicUsage(body: string): CapturedProviderRequest['usage'] | undefined {
    // SSE stream: look for message_delta with usage, or message_start
    const lines = body.split('\n');
    let usage: CapturedProviderRequest['usage'] | undefined;
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.type === 'message_start' && parsed.message?.usage) {
          usage = {
            inputTokens: parsed.message.usage.input_tokens,
            outputTokens: parsed.message.usage.output_tokens,
            cacheReadTokens: parsed.message.usage.cache_read_input_tokens,
            cacheCreationTokens: parsed.message.usage.cache_creation_input_tokens,
          };
        }
        if (parsed.type === 'message_delta' && parsed.usage) {
          usage = {
            ...usage,
            outputTokens: parsed.usage.output_tokens ?? usage?.outputTokens,
          };
        }
      } catch {
        // skip unparseable lines
      }
    }
    // Non-streaming: try direct JSON parse
    if (!usage) {
      try {
        const parsed = JSON.parse(body);
        if (parsed.usage) {
          usage = {
            inputTokens: parsed.usage.input_tokens,
            outputTokens: parsed.usage.output_tokens,
            cacheReadTokens: parsed.usage.cache_read_input_tokens,
            cacheCreationTokens: parsed.usage.cache_creation_input_tokens,
          };
        }
      } catch {
        // not JSON
      }
    }
    return usage;
  }

  private extractOpenAIUsage(body: string): CapturedProviderRequest['usage'] | undefined {
    // SSE: look for [DONE] predecessor chunk with usage
    const lines = body.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.usage) {
          return {
            inputTokens: parsed.usage.prompt_tokens,
            outputTokens: parsed.usage.completion_tokens,
          };
        }
      } catch {
        // skip
      }
    }
    // Non-streaming
    try {
      const parsed = JSON.parse(body);
      if (parsed.usage) {
        return {
          inputTokens: parsed.usage.prompt_tokens,
          outputTokens: parsed.usage.completion_tokens,
        };
      }
    } catch {
      // not JSON
    }
    return undefined;
  }

  private extractGoogleUsage(body: string): CapturedProviderRequest['usage'] | undefined {
    try {
      const parsed = JSON.parse(body);
      const meta = parsed.usageMetadata;
      if (meta) {
        return {
          inputTokens: meta.promptTokenCount,
          outputTokens: meta.candidatesTokenCount,
        };
      }
    } catch {
      // ignore
    }
    return undefined;
  }
}

// ── Helpers ────────────────────────────────────────────────────

function parseHeaderLines(lines: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();
    headers[key] = value;
  }
  return headers;
}

interface ChunkParseState {
  phase: 'size' | 'data' | 'trailer';
  sizeBuf: string;
  remaining: number;
}

/**
 * Incrementally dechunk `Transfer-Encoding: chunked` data.
 * Returns the decoded payload accumulated from this call.
 */
function dechunk(data: string, state: ChunkParseState): string {
  let output = '';
  let pos = 0;

  while (pos < data.length) {
    if (state.phase === 'size') {
      const nl = data.indexOf('\r\n', pos);
      if (nl === -1) {
        state.sizeBuf += data.slice(pos);
        break;
      }
      state.sizeBuf += data.slice(pos, nl);
      const size = parseInt(state.sizeBuf.trim(), 16);
      state.sizeBuf = '';
      pos = nl + 2;
      if (size === 0) {
        state.phase = 'trailer';
        break;
      }
      state.remaining = size;
      state.phase = 'data';
    } else if (state.phase === 'data') {
      const available = data.length - pos;
      const take = Math.min(state.remaining, available);
      output += data.slice(pos, pos + take);
      pos += take;
      state.remaining -= take;
      if (state.remaining === 0) {
        // skip trailing \r\n after chunk data
        if (data.slice(pos, pos + 2) === '\r\n') pos += 2;
        state.phase = 'size';
      }
    } else {
      // trailer phase — ignore
      break;
    }
  }

  return output;
}
