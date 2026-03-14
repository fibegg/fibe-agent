import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentThinkingSidebar } from './agent-thinking-sidebar';

describe('AgentThinkingSidebar', () => {
  it('renders Agent Thinking heading when expanded', () => {
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} />
    );
    expect(screen.getByRole('heading', { name: 'Agent Thinking' })).toBeTruthy();
  });

  it('renders Model (default) label when expanded and no model set', () => {
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} />
    );
    expect(screen.getByText('Model (default)')).toBeTruthy();
  });

  it('shows Processing when isStreaming is true', () => {
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} isStreaming />
    );
    expect(screen.getByText('Processing')).toBeTruthy();
  });

  it('shows Idle when isStreaming is false', () => {
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} />
    );
    expect(screen.getByText('Idle')).toBeTruthy();
  });

  it('does not show heading or model label when collapsed', () => {
    render(
      <AgentThinkingSidebar isCollapsed onToggle={vi.fn()} />
    );
    expect(screen.queryByRole('heading', { name: 'Agent Thinking' })).toBeNull();
    expect(screen.queryByText('Model (default)')).toBeNull();
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

  it('shows currentModel when provided', () => {
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        currentModel="claude-3-opus"
      />
    );
    expect(screen.getByText('claude-3-opus')).toBeTruthy();
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

  it('shows Online activity heading when expanded', () => {
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} />
    );
    expect(screen.getByText('Online activity')).toBeTruthy();
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

  it('shows Created files & tools blocks when toolEvents provided', () => {
    const toolEvents = [
      { kind: 'file_created' as const, name: 'src/foo.ts', path: 'src/foo.ts' },
      { kind: 'tool_call' as const, name: 'npm run build', summary: 'Build completed' },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        toolEvents={toolEvents}
      />
    );
    expect(screen.getByText('Created files & tools')).toBeTruthy();
    expect(screen.getAllByText('src/foo.ts').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('npm run build')).toBeTruthy();
  });
});
