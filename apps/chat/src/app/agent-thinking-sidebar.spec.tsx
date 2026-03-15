import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentThinkingSidebar } from './agent-thinking-sidebar';

describe('AgentThinkingSidebar', () => {
  it('renders Agent Activity heading when expanded', () => {
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} />
    );
    expect(screen.getByRole('heading', { name: 'Agent Activity' })).toBeTruthy();
  });

  it('shows Processing when isStreaming is true', () => {
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} isStreaming />
    );
    expect(screen.getAllByText('Processing').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Idle when isStreaming is false', () => {
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} />
    );
    expect(screen.getByText('Idle')).toBeTruthy();
  });

  it('does not show heading when collapsed', () => {
    render(
      <AgentThinkingSidebar isCollapsed onToggle={vi.fn()} />
    );
    expect(screen.queryByRole('heading', { name: 'Agent Activity' })).toBeNull();
  });

  it('calls onToggle when sidebar toggle is clicked', () => {
    const onToggle = vi.fn();
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={onToggle} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Collapse thinking panel' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows expand label when collapsed', () => {
    const onToggle = vi.fn();
    render(
      <AgentThinkingSidebar isCollapsed onToggle={onToggle} />
    );
    expect(screen.getByRole('button', { name: 'Expand thinking panel' })).toBeTruthy();
  });

  it('shows reasoning text in scrollable area', () => {
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        reasoningText="Considering the best approach..."
      />
    );
    expect(screen.getByText(/Considering the best approach/)).toBeTruthy();
  });

  it('shows streaming response when reasoningText is empty', () => {
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        streamingResponseText="Streaming chunk one..."
      />
    );
    expect(screen.getByText(/Streaming chunk one/)).toBeTruthy();
  });

  it('prefers reasoningText over streamingResponseText when both set', () => {
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        reasoningText="Internal reasoning"
        streamingResponseText="Streaming output"
      />
    );
    expect(screen.getByText(/Internal reasoning/)).toBeTruthy();
    expect(screen.queryByText(/Streaming output/)).toBeNull();
  });

  it('renders story items when storyItems provided', () => {
    const storyItems = [
      {
        id: '1',
        type: 'stream_start',
        message: 'Response started',
        timestamp: new Date().toISOString(),
      },
      {
        id: '2',
        type: 'step',
        message: 'Generating response – processing',
        timestamp: new Date().toISOString(),
      },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        storyItems={storyItems}
      />
    );
    expect(screen.getByText('Response started')).toBeTruthy();
    expect(screen.getByText(/Generating response/)).toBeTruthy();
  });

  it('renders tool_call activity block with Command label and command text', () => {
    const storyItems = [
      {
        id: 'tc1',
        type: 'tool_call',
        message: 'Ran command',
        timestamp: new Date().toISOString(),
        command: 'npm install',
      },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        storyItems={storyItems}
      />
    );
    expect(screen.getByText('Command')).toBeTruthy();
    expect(screen.getByText('npm install')).toBeTruthy();
  });

  it('shows Session stats section when expanded', () => {
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} />
    );
    expect(screen.getByText('Session Stats')).toBeTruthy();
  });

  it('shows Task complete block when not streaming and story items exist', () => {
    const storyItems = [
      { id: '1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        storyItems={storyItems}
        isStreaming={false}
      />
    );
    expect(screen.getByText('Task complete')).toBeTruthy();
    expect(screen.getByText('Response completed.')).toBeTruthy();
  });

  it('does not show Task complete block when streaming', () => {
    const storyItems = [
      { id: '1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        storyItems={storyItems}
        isStreaming
      />
    );
    expect(screen.queryByText('Task complete')).toBeNull();
  });

  it('shows total actions and session time from sessionActivity', () => {
    const sessionActivity = [
      {
        id: 'e1',
        created_at: '2026-03-14T23:32:47.170Z',
        story: [
          { id: 's1', type: 'stream_start', message: 'Started', timestamp: '2026-03-14T23:32:43.237Z' },
          { id: 's2', type: 'tool_call', message: 'Ran Bash', timestamp: '2026-03-14T23:32:45.000Z' },
        ],
      },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        sessionActivity={sessionActivity}
      />
    );
    expect(screen.getByText('Total actions:')).toBeTruthy();
    expect(screen.getByText('Session time:')).toBeTruthy();
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
  });

  it('does not apply animate-pulse to reasoning block when task is complete', () => {
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        reasoningText="Final reasoning content"
        isStreaming={false}
      />
    );
    const block = screen.getByText(/Final reasoning content/).closest('div')?.parentElement;
    expect(block?.classList.contains('animate-pulse')).toBe(false);
  });

  it('applies animate-pulse to reasoning block when streaming', () => {
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        reasoningText="Thinking..."
        isStreaming
      />
    );
    const block = screen.getByText(/Thinking\.\.\./).closest('div')?.parentElement;
    expect(block?.classList.contains('animate-pulse')).toBe(true);
  });

  it('applies full width and solid background when mobileOverlay is true', () => {
    const { container } = render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} mobileOverlay />
    );
    const panel = container.firstChild as HTMLElement;
    expect(panel.style.width).toBe('100%');
    expect(panel.classList.contains('bg-background')).toBe(true);
  });

  it('uses fixed width when mobileOverlay is false', () => {
    const { container } = render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} />
    );
    const panel = container.firstChild as HTMLElement;
    expect(panel.style.width).not.toBe('100%');
  });
});
