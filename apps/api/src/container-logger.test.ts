import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  containerLog,
  ContainerLoggerService,
  logRequest,
  logWs,
  resetLogLevelCache,
} from './container-logger';

describe('containerLog', () => {
  let stdout: string[];
  let stderr: string[];
  let realStdout: typeof process.stdout.write;
  let realStderr: typeof process.stderr.write;
  let logLevelBackup: string | undefined;

  beforeEach(() => {
    stdout = [];
    stderr = [];
    realStdout = process.stdout.write.bind(process.stdout);
    realStderr = process.stderr.write.bind(process.stderr);
    logLevelBackup = process.env.LOG_LEVEL;
    resetLogLevelCache();
    (process.stdout as { write: (chunk: unknown, cb?: () => void) => boolean }).write = (
      chunk: unknown
    ) => {
      stdout.push(String(chunk));
      return true;
    };
    (process.stderr as { write: (chunk: unknown, cb?: () => void) => boolean }).write = (
      chunk: unknown
    ) => {
      stderr.push(String(chunk));
      return true;
    };
  });

  afterEach(() => {
    process.env.LOG_LEVEL = logLevelBackup;
    process.stdout.write = realStdout;
    process.stderr.write = realStderr;
  });

  test('error writes to stderr with level error', () => {
    process.env.LOG_LEVEL = 'error';
    containerLog.error('fail');
    expect(stderr).toHaveLength(1);
    const line = stderr[0];
    expect(line).toBeDefined();
    expect(JSON.parse(line as string)).toMatchObject({ level: 'error', message: 'fail' });
  });

  test('error includes context when provided', () => {
    process.env.LOG_LEVEL = 'error';
    containerLog.error('msg', 'Ctx');
    const line = stderr[0];
    expect(line).toBeDefined();
    expect(JSON.parse(line as string).context).toBe('Ctx');
  });

  test('error includes extra when provided', () => {
    process.env.LOG_LEVEL = 'error';
    containerLog.error('msg', undefined, { trace: 'stack' });
    const line = stderr[0];
    expect(line).toBeDefined();
    expect(JSON.parse(line as string).trace).toBe('stack');
  });

  test('warn writes to stderr with level warn', () => {
    process.env.LOG_LEVEL = 'warn';
    containerLog.warn('w');
    expect(stderr).toHaveLength(1);
    const line = stderr[0];
    expect(line).toBeDefined();
    expect(JSON.parse(line as string).level).toBe('warn');
  });

  test('log writes to stdout with level log', () => {
    process.env.LOG_LEVEL = 'log';
    containerLog.log('hi');
    expect(stdout).toHaveLength(1);
    const line = stdout[0];
    expect(line).toBeDefined();
    expect(JSON.parse(line as string)).toMatchObject({ level: 'log', message: 'hi' });
  });

  test('LOG_LEVEL error suppresses warn and log', () => {
    process.env.LOG_LEVEL = 'error';
    containerLog.warn('w');
    containerLog.log('l');
    expect(stderr).toHaveLength(0);
    expect(stdout).toHaveLength(0);
  });

  test('LOG_LEVEL warn allows error and warn', () => {
    process.env.LOG_LEVEL = 'warn';
    containerLog.error('e');
    containerLog.warn('w');
    expect(stderr).toHaveLength(2);
  });

  test('LOG_LEVEL log allows error warn log', () => {
    process.env.LOG_LEVEL = 'log';
    containerLog.error('e');
    containerLog.warn('w');
    containerLog.log('l');
    expect(stderr).toHaveLength(2);
    expect(stdout).toHaveLength(1);
  });

  test('LOG_LEVEL info is treated as log', () => {
    process.env.LOG_LEVEL = 'info';
    containerLog.log('ok');
    expect(stdout).toHaveLength(1);
  });

  test('output has timestamp in ISO format', () => {
    process.env.LOG_LEVEL = 'log';
    containerLog.log('x');
    const line = stdout[0];
    expect(line).toBeDefined();
    const parsed = JSON.parse(line as string);
    expect(parsed.timestamp).toBeDefined();
    expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
  });
});

describe('ContainerLoggerService', () => {
  let stdout: string[];
  let stderr: string[];
  let realStdout: typeof process.stdout.write;
  let realStderr: typeof process.stderr.write;

  beforeEach(() => {
    stdout = [];
    stderr = [];
    realStdout = process.stdout.write.bind(process.stdout);
    realStderr = process.stderr.write.bind(process.stderr);
    resetLogLevelCache();
    process.env.LOG_LEVEL = 'verbose';
    (process.stdout as { write: (chunk: unknown) => boolean }).write = (chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    };
    (process.stderr as { write: (chunk: unknown) => boolean }).write = (chunk: unknown) => {
      stderr.push(String(chunk));
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = realStdout;
    process.stderr.write = realStderr;
  });

  test('setContext sets context for subsequent logs', () => {
    const logger = new ContainerLoggerService();
    logger.setContext('MyService');
    logger.log('hello');
    const line = stdout[0];
    expect(line).toBeDefined();
    expect(JSON.parse(line as string).context).toBe('MyService');
  });

  test('constructor context is used when setContext not called', () => {
    const logger = new ContainerLoggerService('Init');
    logger.log('x');
    const line = stdout[0];
    expect(line).toBeDefined();
    expect(JSON.parse(line as string).context).toBe('Init');
  });

  test('log forwards to containerLog with context', () => {
    const logger = new ContainerLoggerService('L');
    logger.log('m');
    const line = stdout[0];
    expect(line).toBeDefined();
    expect(JSON.parse(line as string)).toMatchObject({ level: 'log', context: 'L', message: 'm' });
  });

  test('error forwards message and trace as extra', () => {
    const logger = new ContainerLoggerService('E');
    logger.error('err', 'trace line');
    const line = stderr[0];
    expect(line).toBeDefined();
    expect(JSON.parse(line as string).trace).toBe('trace line');
  });

  test('warn forwards to containerLog', () => {
    const logger = new ContainerLoggerService('W');
    logger.warn('w');
    const line = stderr[0];
    expect(line).toBeDefined();
    expect(JSON.parse(line as string).level).toBe('warn');
  });

  test('debug forwards to containerLog', () => {
    const logger = new ContainerLoggerService('D');
    logger.debug('d');
    const line = stdout[0];
    expect(line).toBeDefined();
    expect(JSON.parse(line as string).level).toBe('debug');
  });

  test('verbose forwards to containerLog', () => {
    const logger = new ContainerLoggerService('V');
    logger.verbose('v');
    const line = stdout[0];
    expect(line).toBeDefined();
    expect(JSON.parse(line as string).level).toBe('verbose');
  });
});

describe('logRequest', () => {
  let stdout: string[];
  let realStdout: typeof process.stdout.write;

  beforeEach(() => {
    stdout = [];
    realStdout = process.stdout.write.bind(process.stdout);
    resetLogLevelCache();
    process.env.LOG_LEVEL = 'log';
    (process.stdout as { write: (chunk: unknown) => boolean }).write = (chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = realStdout;
  });

  test('writes JSON with context http and message request', () => {
    logRequest({
      requestId: 'id1',
      method: 'GET',
      url: '/api/health',
      statusCode: 200,
      durationMs: 5,
    });
    const line = stdout[0];
    expect(line).toBeDefined();
    const parsed = JSON.parse(line as string);
    expect(parsed.context).toBe('http');
    expect(parsed.message).toBe('request');
  });

  test('includes requestId method url statusCode durationMs', () => {
    logRequest({
      requestId: 'r2',
      method: 'POST',
      url: '/api/auth/login',
      statusCode: 401,
      durationMs: 10,
    });
    const line = stdout[0];
    expect(line).toBeDefined();
    const parsed = JSON.parse(line as string);
    expect(parsed.requestId).toBe('r2');
    expect(parsed.method).toBe('POST');
    expect(parsed.url).toBe('/api/auth/login');
    expect(parsed.statusCode).toBe(401);
    expect(parsed.durationMs).toBe(10);
  });

  test('does not write when LOG_LEVEL is error', () => {
    process.env.LOG_LEVEL = 'error';
    logRequest({
      requestId: 'x',
      method: 'GET',
      url: '/',
      statusCode: 200,
      durationMs: 0,
    });
    expect(stdout).toHaveLength(0);
  });
});

describe('logWs', () => {
  let stdout: string[];
  let realStdout: typeof process.stdout.write;

  beforeEach(() => {
    stdout = [];
    realStdout = process.stdout.write.bind(process.stdout);
    resetLogLevelCache();
    process.env.LOG_LEVEL = 'log';
    (process.stdout as { write: (chunk: unknown) => boolean }).write = (chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = realStdout;
  });

  test('connect event writes context ws and message connect', () => {
    logWs({ event: 'connect' });
    const line = stdout[0];
    expect(line).toBeDefined();
    const parsed = JSON.parse(line as string);
    expect(parsed.context).toBe('ws');
    expect(parsed.message).toBe('connect');
  });

  test('disconnect event can include closeCode', () => {
    logWs({ event: 'disconnect', closeCode: 4001 });
    const line = stdout[0];
    expect(line).toBeDefined();
    expect(JSON.parse(line as string).closeCode).toBe(4001);
  });

  test('action event includes action name', () => {
    logWs({ event: 'action', action: 'send_chat_message' });
    const line = stdout[0];
    expect(line).toBeDefined();
    const parsed = JSON.parse(line as string);
    expect(parsed.message).toBe('action');
    expect(parsed.action).toBe('send_chat_message');
  });

  test('disconnect can include error', () => {
    logWs({ event: 'disconnect', error: 'Connection reset' });
    const line = stdout[0];
    expect(line).toBeDefined();
    expect(JSON.parse(line as string).error).toBe('Connection reset');
  });

  test('does not write when LOG_LEVEL is error', () => {
    process.env.LOG_LEVEL = 'error';
    logWs({ event: 'connect' });
    expect(stdout).toHaveLength(0);
  });
});
