import { describe, test, expect } from 'bun:test';
import { ClaudeSdkStrategy } from './claude-sdk.strategy';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

function createState() {
  return {
    inThinking: false,
    currentToolBlock: null,
    usage: null,
    emittedVisibleOutput: false,
    emittedTextDelta: false,
    errorText: '',
    sessionId: null,
  };
}

describe('ClaudeSdkStrategy SDK message handling', () => {
  test('uses result text when the SDK emitted only hidden thinking deltas', () => {
    const strategy = new ClaudeSdkStrategy();
    const state = createState();
    const chunks: string[] = [];

    (strategy as unknown as {
      handleSdkMessage: (
        message: SDKMessage,
        state: ReturnType<typeof createState>,
        onChunk: (chunk: string) => void
      ) => void;
    }).handleSdkMessage(
      {
        type: 'stream_event',
        session_id: 'session-1',
        event: {
          type: 'content_block_delta',
          delta: { type: 'thinking_delta', thinking: 'hidden reasoning' },
        },
      } as unknown as SDKMessage,
      state,
      (chunk) => chunks.push(chunk)
    );

    expect(state.emittedVisibleOutput).toBe(false);

    (strategy as unknown as {
      handleSdkMessage: (
        message: SDKMessage,
        state: ReturnType<typeof createState>,
        onChunk: (chunk: string) => void
      ) => void;
    }).handleSdkMessage(
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        session_id: 'session-1',
        result: 'OK',
        usage: { input_tokens: 1, output_tokens: 2 },
      } as unknown as SDKMessage,
      state,
      (chunk) => chunks.push(chunk)
    );

    expect(chunks).toEqual(['OK']);
    expect(state.emittedVisibleOutput).toBe(true);
  });

  test('does not duplicate assistant snapshots after text deltas were streamed', () => {
    const strategy = new ClaudeSdkStrategy();
    const state = createState();
    const chunks: string[] = [];

    const handle = (message: SDKMessage) =>
      (strategy as unknown as {
        handleSdkMessage: (
          message: SDKMessage,
          state: ReturnType<typeof createState>,
          onChunk: (chunk: string) => void
        ) => void;
      }).handleSdkMessage(message, state, (chunk) => chunks.push(chunk));

    handle({
      type: 'stream_event',
      session_id: 'session-1',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hello' },
      },
    } as unknown as SDKMessage);
    handle({
      type: 'assistant',
      session_id: 'session-1',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
    } as unknown as SDKMessage);

    expect(chunks).toEqual(['Hello']);
  });
});
