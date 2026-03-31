import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarReasoningPanel } from './sidebar-reasoning-panel';

vi.mock('./agent-thinking-blocks', () => ({
  ThinkingTextWithHighlights: ({ text }: { text: string }) => (
    <span data-testid="thinking-text">{text}</span>
  ),
}));

describe('SidebarReasoningPanel', () => {
  const scrollRef = { current: null } as React.RefObject<HTMLSpanElement | null>;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no displayThinkingText and not streaming', () => {
    const { container } = render(
      <SidebarReasoningPanel
        displayThinkingText=""
        isStreaming={false}
        reasoningMaxHeightPx={null}
        thinkingScrollRef={scrollRef}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when isStreaming is true even with no text', () => {
    render(
      <SidebarReasoningPanel
        displayThinkingText=""
        isStreaming={true}
        reasoningMaxHeightPx={null}
        thinkingScrollRef={scrollRef}
      />
    );
    expect(screen.getByText('Response')).toBeTruthy();
    expect(screen.getByTestId('thinking-text').textContent).toBe('…');
  });

  it('renders when displayThinkingText is non-empty', () => {
    render(
      <SidebarReasoningPanel
        displayThinkingText="Some reasoning"
        isStreaming={false}
        reasoningMaxHeightPx={null}
        thinkingScrollRef={scrollRef}
      />
    );
    expect(screen.getByText('Response')).toBeTruthy();
    expect(screen.getByTestId('thinking-text').textContent).toBe('Some reasoning');
  });

  it('applies animate-pulse class when streaming', () => {
    const { container } = render(
      <SidebarReasoningPanel
        displayThinkingText="streaming"
        isStreaming={true}
        reasoningMaxHeightPx={null}
        thinkingScrollRef={scrollRef}
      />
    );
    const block = container.querySelector('.animate-pulse');
    expect(block).toBeTruthy();
  });

  it('does not apply animate-pulse when not streaming', () => {
    const { container } = render(
      <SidebarReasoningPanel
        displayThinkingText="done"
        isStreaming={false}
        reasoningMaxHeightPx={null}
        thinkingScrollRef={scrollRef}
      />
    );
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });

  it('applies maxHeight style when reasoningMaxHeightPx is set', () => {
    const { container } = render(
      <SidebarReasoningPanel
        displayThinkingText="text"
        isStreaming={false}
        reasoningMaxHeightPx={200}
        thinkingScrollRef={scrollRef}
      />
    );
    const block = container.firstChild as HTMLElement;
    expect(block?.style.maxHeight).toBe('200px');
  });

  it('no maxHeight style when reasoningMaxHeightPx is null', () => {
    const { container } = render(
      <SidebarReasoningPanel
        displayThinkingText="text"
        isStreaming={false}
        reasoningMaxHeightPx={null}
        thinkingScrollRef={scrollRef}
      />
    );
    const block = container.firstChild as HTMLElement;
    expect(block?.style.maxHeight).toBe('');
  });

  it('renders as a clickable button when latestActivityId and onActivityClick provided', () => {
    const onActivityClick = vi.fn();
    render(
      <SidebarReasoningPanel
        displayThinkingText="text"
        isStreaming={false}
        reasoningMaxHeightPx={null}
        thinkingScrollRef={scrollRef}
        latestActivityId="act-123"
        onActivityClick={onActivityClick}
      />
    );
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(onActivityClick).toHaveBeenCalledWith({ activityId: 'act-123' });
  });

  it('does not render a button when latestActivityId is missing', () => {
    render(
      <SidebarReasoningPanel
        displayThinkingText="text"
        isStreaming={false}
        reasoningMaxHeightPx={null}
        thinkingScrollRef={scrollRef}
        onActivityClick={vi.fn()}
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not render a button when onActivityClick is missing', () => {
    render(
      <SidebarReasoningPanel
        displayThinkingText="text"
        isStreaming={false}
        reasoningMaxHeightPx={null}
        thinkingScrollRef={scrollRef}
        latestActivityId="act-456"
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
