import { spawn, type ChildProcess, type SpawnOptionsWithoutStdio } from 'node:child_process';
import type { Logger } from '@nestjs/common';

export type JsonLineRpcId = string | number;

export interface JsonLineRpcMessage {
  id?: JsonLineRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

export type JsonLineRpcNotificationHandler = (message: JsonLineRpcMessage) => void;
export type JsonLineRpcCloseHandler = (error: Error) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
}

export class JsonLineRpcProcess {
  private proc: ChildProcess | null = null;
  private nextId = 1;
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private closed = false;
  private readonly pending = new Map<JsonLineRpcId, PendingRequest>();
  private readonly notificationHandlers = new Set<JsonLineRpcNotificationHandler>();
  private readonly closeHandlers = new Set<JsonLineRpcCloseHandler>();

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly options: SpawnOptionsWithoutStdio & {
      logger?: Logger;
      requestTimeoutMs?: number;
    } = {},
  ) {}

  request<T = unknown>(method: string, params?: unknown, timeoutMs = this.options.requestTimeoutMs ?? 60_000): Promise<T> {
    this.start();
    const id = this.nextId++;
    const message = params === undefined ? { method, id } : { method, id, params };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for app-server response to ${method}`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });

      try {
        this.writeMessage(message);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  notify(method: string, params?: unknown): void {
    this.start();
    this.writeMessage(params === undefined ? { method } : { method, params });
  }

  onNotification(handler: JsonLineRpcNotificationHandler): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  onClose(handler: JsonLineRpcCloseHandler): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  close(signal: NodeJS.Signals = 'SIGTERM'): void {
    this.closed = true;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('app-server process closed'));
      this.pending.delete(id);
    }
    if (this.proc && !this.proc.killed) {
      this.proc.kill(signal);
    }
    this.proc = null;
  }

  private start(): void {
    if (this.proc || this.closed) {
      if (this.closed) throw new Error('app-server process is closed');
      return;
    }

    this.proc = spawn(this.command, this.args, {
      ...this.options,
      shell: false,
      stdio: 'pipe',
    });

    this.proc.stdout?.on('data', (chunk: Buffer | string) => this.handleStdout(chunk.toString()));
    this.proc.stderr?.on('data', (chunk: Buffer | string) => {
      this.stderrBuffer += chunk.toString();
    });
    this.proc.on('error', (err) => this.rejectAll(err));
    this.proc.on('close', (code, signal) => {
      if (this.stdoutBuffer.trim()) this.handleLine(this.stdoutBuffer);
      const detail = this.stderrBuffer.trim();
      const error = new Error(detail || `app-server exited with ${signal ?? `code ${code}`}`);
      this.rejectAll(error);
      for (const handler of this.closeHandlers) handler(error);
      this.proc = null;
    });
  }

  private writeMessage(message: Record<string, unknown>): void {
    if (!this.proc?.stdin?.writable) throw new Error('app-server stdin is not writable');
    this.proc.stdin.write(JSON.stringify(message) + '\n');
  }

  private handleStdout(text: string): void {
    this.stdoutBuffer += text;
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) this.handleLine(line);
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed: JsonLineRpcMessage;
    try {
      parsed = JSON.parse(trimmed) as JsonLineRpcMessage;
    } catch {
      this.options.logger?.debug?.(`Ignoring non-JSON app-server output: ${trimmed}`);
      return;
    }

    if (parsed.id !== undefined && (Object.prototype.hasOwnProperty.call(parsed, 'result') || Object.prototype.hasOwnProperty.call(parsed, 'error'))) {
      const pending = this.pending.get(parsed.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(parsed.id);
      if (parsed.error) {
        pending.reject(new Error(this.errorMessage(parsed.error)));
      } else {
        pending.resolve(parsed.result);
      }
      return;
    }

    if (parsed.method) {
      for (const handler of this.notificationHandlers) handler(parsed);
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
    return JSON.stringify(error);
  }
}
