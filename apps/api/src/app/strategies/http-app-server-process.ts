import { spawn, type ChildProcess, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { createServer } from 'node:net';
import type { Logger } from '@nestjs/common';

export type HttpAppServerArgs = string[] | ((port: number) => string[]);

export interface HttpAppServerOutput {
  stream: 'stdout' | 'stderr';
  text: string;
}

export interface HttpAppServerOptions extends Omit<SpawnOptionsWithoutStdio, 'stdio'> {
  host?: string;
  healthPath?: string;
  logger?: Logger;
  startupTimeoutMs?: number;
  healthRequestTimeoutMs?: number;
  requestTimeoutMs?: number;
  terminateProcessGroup?: boolean;
}

export interface JsonRequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const OUTPUT_TAIL_LENGTH = 8_192;
const STOP_GRACE_MS = 1_000;

export class HttpAppServerProcess {
  private proc: ChildProcess | null = null;
  private port: number | null = null;
  private stopping = false;
  private closed = Promise.resolve();
  private killTimer?: NodeJS.Timeout;
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private readonly closeHandlers = new Set<() => void>();
  private readonly outputHandlers = new Set<(output: HttpAppServerOutput) => void>();

  constructor(
    private readonly command: string,
    private readonly args: HttpAppServerArgs,
    private readonly options: HttpAppServerOptions = {},
  ) {}

  isRunning(): boolean {
    return !this.stopping && !!this.proc?.pid &&
      this.proc.exitCode === null && this.proc.signalCode === null;
  }

  async start(): Promise<void> {
    if (this.proc) return;
    const { terminateProcessGroup, ...options } = this.options;
    if (terminateProcessGroup && this.stopping) throw new Error('HTTP app-server was stopped');

    this.port = await this.findFreePort(options.host ?? '127.0.0.1');
    if (terminateProcessGroup && this.stopping) throw new Error('HTTP app-server was stopped');
    this.stopping = false;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    const args = typeof this.args === 'function' ? this.args(this.port) : this.args;
    const proc = spawn(this.command, args, {
      ...options,
      ...(terminateProcessGroup ? { detached: process.platform !== 'win32' } : {}),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.proc = proc;

    proc.stdout?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      this.stdoutBuffer = (this.stdoutBuffer + text).slice(-OUTPUT_TAIL_LENGTH);
      this.emitOutput({ stream: 'stdout', text });
    });
    proc.stderr?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      this.stderrBuffer = (this.stderrBuffer + text).slice(-OUTPUT_TAIL_LENGTH);
      this.emitOutput({ stream: 'stderr', text });
    });
    proc.on('error', (err) => {
      this.options.logger?.warn?.(`HTTP app-server process error: ${err.message}`);
    });
    if (terminateProcessGroup) {
      proc.once('exit', (code, signal) => {
        if (!this.stopping) {
          this.warnUnexpectedExit(code, signal);
          void this.close();
        }
      });
    }
    this.closed = new Promise<void>((resolve) => {
      proc.once('close', (code, signal) => {
        if (terminateProcessGroup) {
          clearTimeout(this.killTimer);
          // The leader can exit before a local MCP child in its process group.
          this.signalProcess(proc, 'SIGKILL');
        }
        if (this.proc === proc) {
          if (!this.stopping) this.warnUnexpectedExit(code, signal);
          this.proc = null;
          this.stopping = true;
        }
        resolve();
        for (const handler of this.closeHandlers) handler();
      });
    });

    await this.waitForHealthy();
  }

  onOutput(handler: (output: HttpAppServerOutput) => void): () => void {
    this.outputHandlers.add(handler);
    return () => {
      this.outputHandlers.delete(handler);
    };
  }

  onClose(handler: () => void): () => void {
    this.closeHandlers.add(handler);
    return () => {
      this.closeHandlers.delete(handler);
    };
  }

  baseUrl(): string {
    if (!this.port) throw new Error('HTTP app-server has not started');
    return `http://${this.options.host ?? '127.0.0.1'}:${this.port}`;
  }

  url(path: string, query?: JsonRequestOptions['query']): string {
    const url = new URL(path, this.baseUrl());
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async json<T>(path: string, options: JsonRequestOptions = {}): Promise<T> {
    if (this.options.terminateProcessGroup) {
      if (!this.isRunning()) throw new Error('HTTP app-server is not running');
    } else {
      await this.start();
    }
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abortFromCaller();
    else options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeoutMs = options.timeoutMs ?? this.options.requestTimeoutMs ?? 120_000;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    timeout.unref?.();
    const method = options.method ?? (options.body === undefined ? 'GET' : 'POST');
    try {
      const res = await fetch(this.url(path, options.query), {
        method,
        headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text.trim() || `HTTP app-server request failed with ${res.status}: ${method} ${path}`);
      }
      if (res.status === 204) return undefined as T;
      return await res.json() as T;
    } catch (err) {
      if (timedOut) {
        throw new Error(`HTTP app-server request timed out after ${timeoutMs}ms: ${method} ${path}`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  close(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    if (!this.options.terminateProcessGroup) {
      this.stopping = true;
      if (this.proc && !this.proc.killed) this.proc.kill(signal);
      this.proc = null;
      return Promise.resolve();
    }
    if (!this.stopping) {
      this.stopping = true;
      const proc = this.proc;
      if (proc?.pid) {
        this.signalProcess(proc, signal);
        this.killTimer = setTimeout(
          () => this.signalProcess(proc, 'SIGKILL'),
          STOP_GRACE_MS,
        );
      }
    }
    return this.closed;
  }

  private warnUnexpectedExit(code: number | null, signal: NodeJS.Signals | null): void {
    const detail = this.options.terminateProcessGroup
      ? ''
      : this.stderrBuffer.trim() || this.stdoutBuffer.trim();
    this.options.logger?.warn?.(
      `HTTP app-server exited unexpectedly with ${signal ?? `code ${code}`}${detail ? `: ${detail}` : ''}`,
    );
  }

  private signalProcess(proc: ChildProcess, signal: NodeJS.Signals): void {
    if (!proc.pid) return;
    if (process.platform === 'win32') {
      if (proc.exitCode === null && proc.signalCode === null) proc.kill(signal);
      return;
    }
    try {
      process.kill(-proc.pid, signal);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err;
    }
  }

  private async waitForHealthy(): Promise<void> {
    const timeoutMs = this.options.startupTimeoutMs ?? 15_000;
    const healthRequestTimeoutMs = this.options.healthRequestTimeoutMs ?? 1_000;
    const startedAt = Date.now();
    const healthPath = this.options.healthPath ?? '/global/health';
    let lastError: unknown;

    while (Date.now() - startedAt < timeoutMs) {
      if (!this.proc || (this.options.terminateProcessGroup && !this.isRunning())) break;
      const remainingMs = timeoutMs - (Date.now() - startedAt);
      const requestTimeoutMs = Math.max(1, Math.min(healthRequestTimeoutMs, remainingMs));
      try {
        const res = await this.fetchHealth(this.url(healthPath), requestTimeoutMs);
        if (res.ok && (!this.options.terminateProcessGroup || this.isRunning())) return;
        lastError = new Error(`health check returned ${res.status}`);
      } catch (err) {
        lastError = err;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const detail = this.stderrBuffer.trim() || this.stdoutBuffer.trim();
    await this.close();
    const suffix = detail ? `: ${detail}` : '';
    throw new Error(`Timed out waiting for HTTP app-server health${suffix || (lastError ? `: ${String(lastError)}` : '')}`);
  }

  private async fetchHealth(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    timeout.unref?.();

    try {
      return await fetch(url, { signal: controller.signal });
    } catch (err) {
      if (timedOut) {
        throw new Error(`health check request timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private emitOutput(output: HttpAppServerOutput): void {
    for (const handler of this.outputHandlers) {
      try {
        handler(output);
      } catch (err) {
        this.options.logger?.warn?.(`HTTP app-server output handler failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private findFreePort(host: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.unref();
      server.on('error', reject);
      server.listen(0, host, () => {
        const address = server.address();
        server.close(() => {
          if (typeof address === 'object' && address?.port) resolve(address.port);
          else reject(new Error('Unable to allocate HTTP app-server port'));
        });
      });
    });
  }
}
