import { describe, test, expect } from 'bun:test';
import { TrafficRecorder } from './traffic-recorder';
import type { CapturedProviderRequest } from './types';

function makeRecorder(
  hostname = 'api.anthropic.com',
  options?: { maxBodySize?: number; redactBodies?: boolean }
): { recorder: TrafficRecorder; getResult: () => CapturedProviderRequest | null } {
  let result: CapturedProviderRequest | null = null;
  const recorder = new TrafficRecorder(hostname, 443, (record) => { result = record; }, options);
  return { recorder, getResult: () => result };
}

describe('TrafficRecorder', () => {
  test('captures a simple request-response pair', () => {
    const { recorder, getResult } = makeRecorder();

    const reqBytes = Buffer.from(
      'POST /v1/messages HTTP/1.1\r\n' +
      'Host: api.anthropic.com\r\n' +
      'Content-Type: application/json\r\n' +
      'Authorization: Bearer sk-secret\r\n' +
      'Content-Length: 27\r\n' +
      '\r\n' +
      '{"model":"claude-sonnet-4-20250514"}'
    );

    const resBytes = Buffer.from(
      'HTTP/1.1 200 OK\r\n' +
      'Content-Type: application/json\r\n' +
      'Content-Length: 17\r\n' +
      '\r\n' +
      '{"result":"done"}'
    );

    recorder.feedRequest(reqBytes);
    recorder.feedResponse(resBytes);
    recorder.end();

    const result = getResult();
    expect(result).not.toBeNull();
    expect(result?.provider).toBe('anthropic');
    expect(result?.request.method).toBe('POST');
    expect(result?.request.url).toBe('https://api.anthropic.com/v1/messages');
    expect(result?.request.headers['authorization']).toBe('[REDACTED]');
    expect(result?.request.headers['content-type']).toBe('application/json');
    expect(result?.request.body).toBe('{"model":"claude-sonnet-4-20250514"}');
    expect(result?.response.statusCode).toBe(200);
    expect(result?.response.body).toBe('{"result":"done"}');
    expect(result?.error).toBeNull();
  });

  test('handles chunked transfer encoding', () => {
    const { recorder, getResult } = makeRecorder();

    recorder.feedRequest(Buffer.from(
      'POST /v1/messages HTTP/1.1\r\n' +
      'Host: api.anthropic.com\r\n' +
      'Content-Length: 2\r\n' +
      '\r\n' +
      '{}'
    ));

    recorder.feedResponse(Buffer.from(
      'HTTP/1.1 200 OK\r\n' +
      'Transfer-Encoding: chunked\r\n' +
      'Content-Type: text/event-stream\r\n' +
      '\r\n' +
      '5\r\n' +
      'Hello\r\n' +
      '6\r\n' +
      ' World\r\n' +
      '0\r\n' +
      '\r\n'
    ));

    recorder.end();

    const result = getResult();
    expect(result).not.toBeNull();
    expect(result?.response.body).toBe('Hello World');
    expect(result?.isStreaming).toBe(true);
  });

  test('handles streaming data arriving in multiple chunks', () => {
    const { recorder, getResult } = makeRecorder();

    recorder.feedRequest(Buffer.from(
      'POST /v1/messages HTTP/1.1\r\n' +
      'Host: api.anthropic.com\r\n' +
      'Content-Length: 2\r\n' +
      '\r\n' +
      '{}'
    ));

    // Headers arrive first
    recorder.feedResponse(Buffer.from(
      'HTTP/1.1 200 OK\r\n' +
      'Transfer-Encoding: chunked\r\n' +
      '\r\n'
    ));

    // Then chunks arrive over time
    recorder.feedResponse(Buffer.from('5\r\nHello\r\n'));
    recorder.feedResponse(Buffer.from('1\r\n \r\n'));
    recorder.feedResponse(Buffer.from('5\r\nWorld\r\n'));
    recorder.feedResponse(Buffer.from('0\r\n\r\n'));

    recorder.end();

    const result = getResult();
    expect(result?.response.body).toBe('Hello World');
  });

  test('truncates bodies exceeding max size', () => {
    const { recorder, getResult } = makeRecorder('api.openai.com', { maxBodySize: 10 });

    recorder.feedRequest(Buffer.from(
      'POST /v1/chat/completions HTTP/1.1\r\n' +
      'Host: api.openai.com\r\n' +
      'Content-Length: 20\r\n' +
      '\r\n' +
      '12345678901234567890'
    ));

    recorder.feedResponse(Buffer.from(
      'HTTP/1.1 200 OK\r\n' +
      'Content-Length: 5\r\n' +
      '\r\n' +
      'short'
    ));

    recorder.end();

    const result = getResult();
    expect(result?.request.bodyTruncated).toBe(true);
    expect(result?.request.body?.length).toBe(10);
    expect(result?.response.bodyTruncated).toBe(false);
  });

  test('redacts bodies when option is set', () => {
    const { recorder, getResult } = makeRecorder('api.anthropic.com', { redactBodies: true });

    recorder.feedRequest(Buffer.from(
      'POST /v1/messages HTTP/1.1\r\n' +
      'Host: api.anthropic.com\r\n' +
      'Content-Length: 13\r\n' +
      '\r\n' +
      '{"secret": 1}'
    ));

    recorder.feedResponse(Buffer.from(
      'HTTP/1.1 200 OK\r\n' +
      'Content-Length: 4\r\n' +
      '\r\n' +
      'data'
    ));

    recorder.end();

    const result = getResult();
    expect(result?.request.body).toBe('[REDACTED]');
    expect(result?.response.body).toBe('[REDACTED]');
  });

  test('records error on abnormal end', () => {
    const { recorder, getResult } = makeRecorder();

    recorder.feedRequest(Buffer.from(
      'POST /v1/messages HTTP/1.1\r\n' +
      'Host: api.anthropic.com\r\n' +
      'Content-Length: 2\r\n' +
      '\r\n' +
      '{}'
    ));

    // Response headers arrive but stream is interrupted
    recorder.feedResponse(Buffer.from(
      'HTTP/1.1 200 OK\r\n' +
      'Transfer-Encoding: chunked\r\n' +
      '\r\n'
    ));

    recorder.end('client_disconnected');

    const result = getResult();
    expect(result?.error).toBe('client_disconnected');
    expect(result?.response.statusCode).toBe(200);
  });

  test('only emits once even if end() called multiple times', () => {
    let callCount = 0;
    const recorder = new TrafficRecorder('api.anthropic.com', 443, () => { callCount++; });

    recorder.feedRequest(Buffer.from('GET / HTTP/1.1\r\nHost: api.anthropic.com\r\n\r\n'));
    recorder.feedResponse(Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n'));

    recorder.end();
    recorder.end();
    recorder.end('error');

    expect(callCount).toBe(1);
  });

  test('extracts Anthropic usage from SSE stream', () => {
    const { recorder, getResult } = makeRecorder();

    const sseBody =
      'event: message_start\n' +
      'data: {"type":"message_start","message":{"usage":{"input_tokens":100,"output_tokens":0,"cache_read_input_tokens":50}}}\n\n' +
      'event: content_block_delta\n' +
      'data: {"type":"content_block_delta","delta":{"text":"Hi"}}\n\n' +
      'event: message_delta\n' +
      'data: {"type":"message_delta","usage":{"output_tokens":25}}\n\n' +
      'event: message_stop\n' +
      'data: {"type":"message_stop"}\n\n';

    recorder.feedRequest(Buffer.from(
      'POST /v1/messages HTTP/1.1\r\nHost: api.anthropic.com\r\nContent-Length: 2\r\n\r\n{}'
    ));

    recorder.feedResponse(Buffer.from(
      `HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: ${Buffer.byteLength(sseBody)}\r\n\r\n${sseBody}`
    ));

    recorder.end();

    const result = getResult();
    expect(result?.usage).toBeDefined();
    expect(result?.usage?.inputTokens).toBe(100);
    expect(result?.usage?.outputTokens).toBe(25);
    expect(result?.usage?.cacheReadTokens).toBe(50);
  });

  test('extracts OpenAI usage from SSE stream', () => {
    const { recorder, getResult } = makeRecorder('api.openai.com');

    const sseBody =
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n' +
      'data: {"choices":[],"usage":{"prompt_tokens":80,"completion_tokens":15}}\n\n' +
      'data: [DONE]\n\n';

    recorder.feedRequest(Buffer.from(
      'POST /v1/chat/completions HTTP/1.1\r\nHost: api.openai.com\r\nContent-Length: 2\r\n\r\n{}'
    ));

    recorder.feedResponse(Buffer.from(
      `HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: ${Buffer.byteLength(sseBody)}\r\n\r\n${sseBody}`
    ));

    recorder.end();

    const result = getResult();
    expect(result?.usage).toBeDefined();
    expect(result?.usage?.inputTokens).toBe(80);
    expect(result?.usage?.outputTokens).toBe(15);
  });

  test('resolves correct provider from hostname', () => {
    const domains: Array<[string, string]> = [
      ['api.anthropic.com', 'anthropic'],
      ['api.openai.com', 'openai'],
      ['generativelanguage.googleapis.com', 'google'],
      ['openrouter.ai', 'openrouter'],
      ['example.com', 'unknown'],
    ];

    for (const [hostname, expected] of domains) {
      const { recorder, getResult } = makeRecorder(hostname);
      recorder.feedRequest(Buffer.from(`GET / HTTP/1.1\r\nHost: ${hostname}\r\n\r\n`));
      recorder.feedResponse(Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n'));
      recorder.end();
      expect(getResult()?.provider).toBe(expected);
    }
  });
});
