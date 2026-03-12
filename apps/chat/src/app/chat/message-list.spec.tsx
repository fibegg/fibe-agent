import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageList, type ChatMessage } from './message-list';

vi.mock('../api-url', () => ({
  getApiUrl: () => '',
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

  it('shows streaming placeholder when streaming with empty text', () => {
    const { container } = render(
      <MessageList messages={[]} streamingText="" isStreaming={true} />
    );
    const dots = container.querySelectorAll('.animate-bounce');
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
});
