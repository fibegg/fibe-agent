import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MessageList, type ChatMessage, type MessageListHandle } from './message-list';

vi.mock('../api-url', () => ({
  buildApiUrl: (path: string) => path,
  getAuthTokenForRequest: () => '',
}));

describe('MessageList', () => {
  it('renders without error when messages is empty and not streaming', () => {
    render(
      <MessageList messages={[]} streamingText="" isStreaming={false} />
    );
    expect(screen.queryByText(/\d{1,2}:\d{2} (AM|PM)/)).toBeFalsy();
  });

  it('renders user message with body and timestamp', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        body: 'Hello',
        created_at: '2025-03-11T17:00:00.000Z',
      },
    ];
    render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText(/\d{1,2}:\d{2} (AM|PM)/)).toBeTruthy();
  });

  it('renders assistant message with body and timestamp', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        body: 'Hi there',
        created_at: '2025-03-11T17:01:00.000Z',
      },
    ];
    render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    expect(screen.getByText('Hi there')).toBeTruthy();
    expect(screen.getByText(/\d{1,2}:\d{2} (AM|PM)/)).toBeTruthy();
  });

  it('does not render Activity section in assistant message when story is present', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        body: 'Done.',
        created_at: '2025-03-11T17:01:00.000Z',
        story: [
          { id: '1', type: 'tool_call', message: 'Ran Bash', timestamp: '2025-03-11T17:00:59.000Z', command: 'ls' },
        ],
      },
    ];
    render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    expect(screen.getByText('Done.')).toBeTruthy();
    expect(screen.queryByText('Activity')).toBeNull();
  });

  it('renders assistant message bubble with card styling', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        body: 'Reply',
        created_at: '2025-03-11T17:01:00.000Z',
      },
    ];
    const { container } = render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    const bubble = container.querySelector('[class*="bg-card"]');
    expect(bubble).toBeTruthy();
    expect(bubble?.textContent).toContain('Reply');
  });

  it('renders multiple messages in order', () => {
    const messages: ChatMessage[] = [
      { role: 'user', body: 'First', created_at: '2025-03-11T12:00:00.000Z' },
      { role: 'assistant', body: 'Second', created_at: '2025-03-11T12:01:00.000Z' },
    ];
    render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Second')).toBeTruthy();
  });

  it('shows thinking state when streaming with empty text', () => {
    render(
      <MessageList messages={[]} streamingText="" isStreaming={true} />
    );
    const dots = document.querySelectorAll('.animate-thinking-bounce');
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });

  it('renders streaming markdown when streamingText is set', () => {
    render(
      <MessageList
        messages={[]}
        streamingText="**Bold** text"
        isStreaming={true}
      />
    );
    expect(screen.getByText(/Bold/)).toBeTruthy();
    expect(screen.getByText(/text/)).toBeTruthy();
  });

  it('renders user message with @path as badge showing path display name', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        body: 'Check @apps/chat/readme.md please',
        created_at: '2025-03-11T17:00:00.000Z',
      },
    ];
    render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    expect(screen.getByText('readme.md')).toBeTruthy();
    expect(screen.getByTitle('apps/chat/readme.md')).toBeTruthy();
  });

  it('renders multiple @mentions as separate badges', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        body: 'Compare @examples and @test-100kb.scss',
        created_at: '2025-03-11T17:00:00.000Z',
      },
    ];
    render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    expect(screen.getByTitle('examples')).toBeTruthy();
    expect(screen.getByTitle('test-100kb.scss')).toBeTruthy();
    expect(screen.getByText('examples')).toBeTruthy();
    expect(screen.getByText('test-100kb.scss')).toBeTruthy();
  });

  it('exposes scrollToBottom via ref', () => {
    const ref = createRef<MessageListHandle | null>();
    const messages: ChatMessage[] = [
      { role: 'user', body: 'Hi', created_at: '2025-03-11T12:00:00.000Z' },
    ];
    render(
      <MessageList ref={ref} messages={messages} streamingText="" isStreaming={false} />
    );
    expect(ref.current).not.toBeNull();
    expect(typeof (ref.current as MessageListHandle).scrollToBottom).toBe('function');
  });

  it('scrollToBottom can be called with no args without throwing', () => {
    const ref = createRef<MessageListHandle | null>();
    const messages: ChatMessage[] = [
      { role: 'user', body: 'Hi', created_at: '2025-03-11T12:00:00.000Z' },
    ];
    render(
      <MessageList ref={ref} messages={messages} streamingText="" isStreaming={false} />
    );
    act(() => {
      const handle = ref.current;
      if (handle) handle.scrollToBottom();
    });
  });

  it('scrollToBottom can be called with behavior without throwing', () => {
    const ref = createRef<MessageListHandle | null>();
    const messages: ChatMessage[] = [
      { role: 'user', body: 'Hi', created_at: '2025-03-11T12:00:00.000Z' },
    ];
    render(
      <MessageList ref={ref} messages={messages} streamingText="" isStreaming={false} />
    );
    act(() => {
      const handle = ref.current;
      if (handle) handle.scrollToBottom('smooth');
    });
  });

  const NO_OUTPUT_BODY = 'Process completed successfully but returned no output.';

  it('does not render Retry when assistant message body does not match noOutputBody', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        body: 'Some reply',
        created_at: '2025-03-11T17:01:00.000Z',
      },
    ];
    render(
      <MessageList
        messages={messages}
        streamingText=""
        isStreaming={false}
        noOutputBody={NO_OUTPUT_BODY}
        onRetry={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('does not render Retry when noOutputBody is not provided', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        body: NO_OUTPUT_BODY,
        created_at: '2025-03-11T17:01:00.000Z',
      },
    ];
    render(
      <MessageList messages={messages} streamingText="" isStreaming={false} onRetry={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('does not render Retry when onRetry is not provided', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        body: NO_OUTPUT_BODY,
        created_at: '2025-03-11T17:01:00.000Z',
      },
    ];
    render(
      <MessageList
        messages={messages}
        streamingText=""
        isStreaming={false}
        noOutputBody={NO_OUTPUT_BODY}
      />
    );
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('renders Retry button when assistant message body matches noOutputBody and onRetry is provided', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        body: NO_OUTPUT_BODY,
        created_at: '2025-03-11T17:01:00.000Z',
      },
    ];
    render(
      <MessageList
        messages={messages}
        streamingText=""
        isStreaming={false}
        noOutputBody={NO_OUTPUT_BODY}
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('calls onRetry when Retry button is clicked', () => {
    const onRetry = vi.fn();
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        body: NO_OUTPUT_BODY,
        created_at: '2025-03-11T17:01:00.000Z',
      },
    ];
    render(
      <MessageList
        messages={messages}
        streamingText=""
        isStreaming={false}
        noOutputBody={NO_OUTPUT_BODY}
        onRetry={onRetry}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
