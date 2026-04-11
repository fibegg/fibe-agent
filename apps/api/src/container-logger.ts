import type { LoggerService } from '@nestjs/common';

const LOG_LEVELS = ['error', 'warn', 'log', 'debug', 'verbose'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  log: 2,
  debug: 3,
  verbose: 4,
};

let cachedMinOrder: number | null = null;

function getMinOrder(): number {
  if (cachedMinOrder !== null) return cachedMinOrder;
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  const level = raw === 'info' ? 'log' : (LOG_LEVELS.includes(raw as LogLevel) ? raw : 'log') as LogLevel;
  cachedMinOrder = LEVEL_ORDER[level];
  return cachedMinOrder;
}

/** Reset the cached log level (for testing only). */
export function resetLogLevelCache(): void {
  cachedMinOrder = null;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] <= getMinOrder();
}

function writeLine(stream: 'stdout' | 'stderr', payload: Record<string, unknown>): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...payload }) + '\n';
  if (stream === 'stderr') process.stderr.write(line);
  else process.stdout.write(line);
}

function write(level: LogLevel, stream: 'stdout' | 'stderr') {
  return (message: string, context?: string, extra?: Record<string, unknown>) => {
    if (!shouldLog(level)) return;
    writeLine(stream, { level, ...(context && { context }), message, ...extra });
  };
}

export const containerLog = {
  error: write('error', 'stderr'),
  warn: write('warn', 'stderr'),
  log: write('log', 'stdout'),
  debug: write('debug', 'stdout'),
  verbose: write('verbose', 'stdout'),
};

export class ContainerLoggerService implements LoggerService {
  private context?: string;

  constructor(context?: string) {
    this.context = context;
  }

  setContext(context: string): void {
    this.context = context;
  }

  log(message: string, context?: string): void {
    containerLog.log(message, context ?? this.context);
  }

  error(message: string, trace?: string, context?: string): void {
    containerLog.error(message, context ?? this.context, trace ? { trace } : undefined);
  }

  warn(message: string, context?: string): void {
    containerLog.warn(message, context ?? this.context);
  }

  debug(message: string, context?: string): void {
    containerLog.debug(message, context ?? this.context);
  }

  verbose(message: string, context?: string): void {
    containerLog.verbose(message, context ?? this.context);
  }
}

export function logRequest(payload: {
  requestId: string;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  error?: string;
}): void {
  if (!shouldLog('log')) return;
  writeLine('stdout', { level: 'log', context: 'http', message: 'request', ...payload });
}

export function logWs(payload: {
  event: 'connect' | 'disconnect' | 'action' | 'rate_limited';
  action?: string;
  closeCode?: number;
  count?: number;
  error?: string;
}): void {
  if (!shouldLog('log')) return;
  writeLine('stdout', { level: 'log', context: 'ws', message: payload.event, ...payload });
}
