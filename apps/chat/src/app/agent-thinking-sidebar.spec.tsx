import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentThinkingSidebar } from './agent-thinking-sidebar';

describe('AgentThinkingSidebar', () => {
  it('renders stats line and activity (brain) button when expanded', () => {
    const sessionActivity = [
      { id: 'e1', created_at: new Date().toISOString(), story: [{ id: 's1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() }] },
    ];
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} sessionActivity={sessionActivity} />
    );
    expect(screen.getByRole('button', { name: 'Activity' })).toBeTruthy();
    expect(screen.getByTitle('Total actions')).toBeTruthy();
  });

  it('does not show stats row when collapsed', () => {
    render(
      <AgentThinkingSidebar isCollapsed onToggle={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: 'Activity' })).toBeNull();
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

  it('renders story items when storyItems provided and streaming', () => {
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
        isStreaming
      />
    );
    expect(screen.getByText('Thinking...')).toBeTruthy();
    expect(screen.getByText(/Generating response/)).toBeTruthy();
  });

  it('renders tool_call activity block with command text in one row', () => {
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
    expect(screen.getByText('npm install')).toBeTruthy();
  });

  it('strips leading "Ran " from tool_call when only message is set', () => {
    const storyItems = [
      {
        id: 'tc1',
        type: 'tool_call',
        message: 'Ran Bash',
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
    expect(screen.getByText('Bash')).toBeTruthy();
    expect(screen.queryByText(/Ran Bash/)).toBeNull();
  });

  it('shows empty state message when no activity', () => {
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} />
    );
    expect(screen.getByText(/are not the droids you deepseek/)).toBeTruthy();
  });

  it('shows stat tooltips when expanded', () => {
    const sessionActivity = [
      { id: 'e1', created_at: new Date().toISOString(), story: [{ id: 's1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() }] },
    ];
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} sessionActivity={sessionActivity} />
    );
    expect(screen.getByTitle('Total actions')).toBeTruthy();
    expect(screen.getByTitle('Completed')).toBeTruthy();
    expect(screen.getByTitle('Processing')).toBeTruthy();
  });

  it('shows Task complete block when not streaming and story items exist', () => {
    const storyItems = [
      { id: '1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() },
      { id: '2', type: 'tool_call', message: 'Ran command', timestamp: new Date().toISOString(), command: 'echo ok' },
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
  });

  it('shows task complete indicator in collapsed chain when not streaming and story items exist', () => {
    const storyItems = [
      { id: '1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() },
      { id: '2', type: 'tool_call', message: 'Ran', timestamp: new Date().toISOString(), command: 'echo ok' },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed
        onToggle={vi.fn()}
        storyItems={storyItems}
        isStreaming={false}
      />
    );
    expect(screen.getByTitle('Task complete')).toBeTruthy();
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

  it('shows totals from sessionActivity in stats line when expanded', () => {
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

  it('does not show AskUserQuestion entries in activity list', () => {
    const storyItems = [
      { id: '1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() },
      { id: '2', type: 'AskUserQuestion', message: 'Ask user', timestamp: new Date().toISOString() },
      { id: '3', type: 'step', message: 'Step done', timestamp: new Date().toISOString() },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        storyItems={storyItems}
        isStreaming
      />
    );
    expect(screen.getByText('Thinking...')).toBeTruthy();
    expect(screen.getByText(/Step done/)).toBeTruthy();
    expect(screen.queryByText(/Ask user/)).toBeNull();
  });

  it('hides Started and step (GENERATING RESPONSE) when not streaming', () => {
    const storyItems = [
      { id: '1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() },
      { id: '2', type: 'step', message: 'GENERATING RESPONSE – PROCESSING', timestamp: new Date().toISOString() },
      { id: '3', type: 'tool_call', message: 'Ran command', timestamp: new Date().toISOString(), command: 'npm run build' },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        storyItems={storyItems}
        isStreaming={false}
      />
    );
    expect(screen.queryByText('Started')).toBeNull();
    expect(screen.queryByText(/GENERATING RESPONSE/)).toBeNull();
    expect(screen.getByText('npm run build')).toBeTruthy();
  });

  it('shows stream_start and step when streaming', () => {
    const storyItems = [
      { id: '1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() },
      { id: '2', type: 'step', message: 'GENERATING RESPONSE – PROCESSING', timestamp: new Date().toISOString() },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        storyItems={storyItems}
        isStreaming
      />
    );
    expect(screen.getByText('Thinking...')).toBeTruthy();
    expect(screen.getByText(/GENERATING RESPONSE/)).toBeTruthy();
  });

  it('groups 3+ consecutive tool_calls into one collapsible commands block', () => {
    const storyItems = [
      { id: '1', type: 'tool_call', message: 'Ran', timestamp: new Date().toISOString(), command: 'echo a' },
      { id: '2', type: 'tool_call', message: 'Ran', timestamp: new Date().toISOString(), command: 'echo b' },
      { id: '3', type: 'tool_call', message: 'Ran', timestamp: new Date().toISOString(), command: 'echo c' },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        storyItems={storyItems}
      />
    );
    expect(screen.getByText(/3 commands/)).toBeTruthy();
    expect(screen.queryByText('echo a')).toBeNull();
    expect(screen.queryByText('echo b')).toBeNull();
    expect(screen.queryByText('echo c')).toBeNull();
  });

  it('shows 2 tool_calls as separate blocks (no group)', () => {
    const storyItems = [
      { id: '1', type: 'tool_call', message: 'Ran', timestamp: new Date().toISOString(), command: 'echo a' },
      { id: '2', type: 'tool_call', message: 'Ran', timestamp: new Date().toISOString(), command: 'echo b' },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        storyItems={storyItems}
      />
    );
    expect(screen.getByText('echo a')).toBeTruthy();
    expect(screen.getByText('echo b')).toBeTruthy();
    expect(screen.queryByText(/2 commands/)).toBeNull();
  });

  it('expanded commands group shows list of commands', () => {
    const storyItems = [
      { id: '1', type: 'tool_call', message: 'Ran', timestamp: new Date().toISOString(), command: 'echo a' },
      { id: '2', type: 'tool_call', message: 'Ran', timestamp: new Date().toISOString(), command: 'echo b' },
      { id: '3', type: 'tool_call', message: 'Ran', timestamp: new Date().toISOString(), command: 'echo c' },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        storyItems={storyItems}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /3 commands/ }));
    expect(screen.getByText('echo a')).toBeTruthy();
    expect(screen.getByText('echo b')).toBeTruthy();
    expect(screen.getByText('echo c')).toBeTruthy();
  });
});
