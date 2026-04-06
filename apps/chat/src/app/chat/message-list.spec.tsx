import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { MessageList, type ChatMessage, type MessageListHandle } from './message-list';

vi.mock('../api-url', () => ({
  buildApiUrl: (path: string) => path,
  getAuthTokenForRequest: () => 'tok',
}));

vi.mock('../avatar-config-context', () => ({
  useAvatarConfig: vi.fn().mockReturnValue({ userAvatarUrl: undefined, assistantAvatarUrl: undefined }),
}));

vi.mock('../file-explorer/prism-loader', () => ({
  highlightCodeElement: vi.fn(),
}));

// Pretext.js measures canvas glyphs — JSDOM has no canvas implementation.
// Return deterministic fixed heights so virtualizer and streaming-bubble tests
// are stable and do not depend on the real layout engine.
vi.mock('./pretext-height', () => ({
  estimateMessageHeight: vi.fn().mockReturnValue(120),
  estimateStreamingHeight: vi.fn().mockReturnValue(160),
  computeTightBubbleWidth: vi.fn().mockReturnValue(200),
  clearPretextCache: vi.fn(),
  getPretextCacheSize: vi.fn().mockReturnValue(0),
}));

vi.mock('./use-local-tts', () => ({
  useLocalTts: vi.fn().mockReturnValue({ stop: vi.fn(), speak: vi.fn().mockResolvedValue(undefined) }),
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

  it('renders user message with imageUrls', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        body: 'Look at this',
        created_at: '2025-03-11T17:00:00.000Z',
        imageUrls: ['test.png', 'test2.jpg'],
      },
    ];
    const { container } = render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    const images = container.querySelectorAll('img');
    expect(images.length).toBe(2);
    expect(images[0]?.getAttribute('src')).toContain('test.png');
    expect(images[0]?.getAttribute('src')).toContain('token=tok');
  });

  it('renders queued status for user message', () => {
    const messages: ChatMessage[] = [
      { role: 'user', body: 'Q', created_at: '2025-03-11T17:00:00.000Z', queued: true },
    ];
    render(<MessageList messages={messages} streamingText="" isStreaming={false} />);
    expect(screen.getByText('Queued')).toBeTruthy();
  });

  it('renders token usage and model for assistant message', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        body: 'A',
        created_at: '2025-03-11T17:00:00.000Z',
        usage: { inputTokens: 1000, outputTokens: 2500 },
        model: 'gemini-2.5',
      },
    ];
    render(<MessageList messages={messages} streamingText="" isStreaming={false} />);
    expect(screen.getByText(/1k in \/ 2\.5k out/i)).toBeTruthy();
    expect(screen.getByText('gemini-2.5')).toBeTruthy();
  });

  it('renders custom avatar URLs when present in context', async () => {
    const { useAvatarConfig } = await import('../avatar-config-context');
    vi.mocked(useAvatarConfig).mockReturnValue({
      userAvatarUrl: 'https://example.com/user.png',
      assistantAvatarUrl: 'https://example.com/bot.png',
    });
    const messages: ChatMessage[] = [
      { role: 'user', body: 'U', created_at: '2025-03-11T17:00:00.000Z' },
      { role: 'assistant', body: 'A', created_at: '2025-03-11T17:01:00.000Z' },
    ];
    const { container } = render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    const userImg = container.querySelector('img[src="https://example.com/user.png"]');
    const botImg = container.querySelector('img[src="https://example.com/bot.png"]');
    expect(userImg).toBeTruthy();
    expect(botImg).toBeTruthy();

    // Reset for other tests
    vi.mocked(useAvatarConfig).mockReturnValue({ userAvatarUrl: undefined, assistantAvatarUrl: undefined });
  });

  it('uses full width class when bothSidebarsCollapsed is true', () => {
    const messages: ChatMessage[] = [{ role: 'user', body: 'U', created_at: '2025-03-11T17:00:00.000Z' }];
    const { container } = render(
      <MessageList messages={messages} streamingText="" isStreaming={false} bothSidebarsCollapsed={true} />
    );
    expect(container.querySelector('.max-w-full')).toBeTruthy();
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

  it('applies min-height style to streaming bubble when streamingText is non-empty', () => {
    const { container } = render(
      <MessageList
        messages={[]}
        streamingText="Streaming response tokens accumulating here"
        isStreaming={true}
      />
    );
    // The streaming bubble wrapper should have an inline min-height style.
    const bubbles = container.querySelectorAll('[style*="min-height"]');
    expect(bubbles.length).toBeGreaterThan(0);
  });

  it('does not apply min-height style to streaming bubble when streamingText is empty', () => {
    const { container } = render(
      <MessageList messages={[]} streamingText="" isStreaming={true} />
    );
    const bubbles = container.querySelectorAll('[style*="min-height"]');
    expect(bubbles.length).toBe(0);
  });

  it('applies tight max-width inline style to short plain user message bubble', () => {
    const messages: ChatMessage[] = [
      { role: 'user', body: 'Yes', created_at: '2025-03-11T17:00:00.000Z' },
    ];
    const { container } = render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    // computeTightBubbleWidth mock returns 200 — the bubble div should have maxWidth:200px
    const bubble = container.querySelector('[style*="max-width"]');
    expect(bubble).toBeTruthy();
  });

  it('does not apply tight max-width to user message containing a code block', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        body: '```ts\nconst x = 1\n```',
        created_at: '2025-03-11T17:00:00.000Z',
      },
    ];
    const { container } = render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    // Code-block messages bypass tight bubble — no inline max-width style expected
    const styledBubble = container.querySelector('[style*="max-width"]');
    expect(styledBubble).toBeNull();
  });

  it('does not apply tight max-width to user message with images', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        body: 'Look at this',
        created_at: '2025-03-11T17:00:00.000Z',
        imageUrls: ['photo.png'],
      },
    ];
    const { container } = render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    const styledBubble = container.querySelector('[style*="max-width"]');
    expect(styledBubble).toBeNull();
  });

  it('does not apply tight max-width to assistant messages', () => {
    const messages: ChatMessage[] = [
      { role: 'assistant', body: 'Sure!', created_at: '2025-03-11T17:01:00.000Z' },
    ];
    const { container } = render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    const styledBubble = container.querySelector('[style*="max-width"]');
    expect(styledBubble).toBeNull();
  });

  it('renders user message body as markdown', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        body: 'Use **bold** and `code`',
        created_at: '2025-03-11T17:00:00.000Z',
      },
    ];
    const { container } = render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    const strong = container.querySelector('strong');
    expect(strong?.textContent).toBe('bold');
    const code = container.querySelector('code');
    expect(code?.textContent).toBe('code');
  });

  it('renders user message fenced code block as pre with language-ts code element', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        body: "```ts\n// One more line at the start :D\nfunction test() {\n  console.log('hello world');\n}\n```",
        created_at: '2025-03-11T17:00:00.000Z',
      },
    ];
    const { container } = render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    const pre = container.querySelector('pre');
    expect(pre).toBeTruthy();
    const code = container.querySelector('code.language-typescript');
    expect(code).toBeTruthy();
    expect(code?.textContent?.trim()).toBe(
      "// One more line at the start :D\nfunction test() {\n  console.log('hello world');\n}"
    );
  });

  it('wraps raw HTML pre from marked into pre code for Prism', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        body: "<pre>function test() { console.log('hello world'); }</pre>",
        created_at: '2025-03-11T17:00:00.000Z',
      },
    ];
    const { container } = render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    const blockCode = container.querySelector('pre > code.language-none');
    expect(blockCode).toBeTruthy();
    expect(blockCode?.textContent).toContain('function test()');
  });

  it('renders user fenced code block without language as pre code', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        body: '```\nhello\n```',
        created_at: '2025-03-11T17:00:00.000Z',
      },
    ];
    const { container } = render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    expect(container.querySelector('pre > code')).toBeTruthy();
  });

  it('renders minified single-line user TypeScript as a typescript code block', () => {
    const body =
      "import type { LoggerService } from '@nestjs/common';const LOG_LEVELS = ['error', 'warn'] as const;type LogLevel = (typeof LOG_LEVELS)[number];";
    const messages: ChatMessage[] = [
      { role: 'user', body, created_at: '2025-03-11T17:00:00.000Z' },
    ];
    const { container } = render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    expect(container.querySelector('pre code.language-typescript')).toBeTruthy();
  });

  it('sets data-code-lang on user message pre when rendering a code block', async () => {
    const body = '```ts\nconst x = 1\n```';
    const messages: ChatMessage[] = [
      { role: 'user', body, created_at: '2025-03-11T17:00:00.000Z' },
    ];
    const { container } = render(
      <MessageList messages={messages} streamingText="" isStreaming={false} />
    );
    await waitFor(() => {
      expect(container.querySelector('pre[data-code-lang]')?.getAttribute('data-code-lang')).toBe(
        'TypeScript'
      );
    });
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

  describe('copy raw message', () => {
    let writeText: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
        writable: true,
      });
    });

    it('writes user message body to the clipboard when copy is clicked', async () => {
      const body = 'Hello **raw**';
      const messages: ChatMessage[] = [
        { role: 'user', body, created_at: '2025-03-11T17:00:00.000Z' },
      ];
      render(<MessageList messages={messages} streamingText="" isStreaming={false} />);
      fireEvent.click(screen.getByRole('button', { name: /Copy raw user message/i }));
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(body);
      });
    });

    it('writes assistant message body to the clipboard when copy is clicked', async () => {
      const body = 'Reply with `code`';
      const messages: ChatMessage[] = [
        { role: 'assistant', body, created_at: '2025-03-11T17:01:00.000Z' },
      ];
      render(<MessageList messages={messages} streamingText="" isStreaming={false} />);
      fireEvent.click(screen.getByRole('button', { name: /Copy raw assistant message/i }));
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(body);
      });
    });

    it('does not render a copy control for a user message with an empty body', () => {
      const messages: ChatMessage[] = [
        { role: 'user', body: '', created_at: '2025-03-11T17:00:00.000Z' },
      ];
      render(<MessageList messages={messages} streamingText="" isStreaming={false} />);
      expect(screen.queryByRole('button', { name: /Copy raw user message/i })).toBeNull();
    });

    it('writes streaming text to the clipboard when copy is clicked', async () => {
      const streamingText = 'Partial **markdown**';
      render(
        <MessageList messages={[]} streamingText={streamingText} isStreaming={true} />
      );
      fireEvent.click(screen.getByRole('button', { name: /Copy raw assistant message/i }));
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(streamingText);
      });
    });
  });
});
