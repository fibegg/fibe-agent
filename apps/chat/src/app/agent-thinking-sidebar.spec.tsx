import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { AgentThinkingSidebar } from './agent-thinking-sidebar';

vi.mock('@tanstack/react-virtual', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-virtual')>();
  return {
    ...actual,
    useVirtualizer: (options: any) => {
      return {
        getVirtualItems: () => {
          if (options.count > 15) {
            return Array.from({ length: 5 }).map((_, i) => ({ index: i, start: i * 32, measureElement: vi.fn() }));
          }
          return [];
        },
        getTotalSize: () => options.count * 32,
        measureElement: vi.fn(),
      };
    },
  };
});

vi.mock('./sidebar-activity-tooltip', () => ({
  SidebarActivityTooltip: ({ tooltip }: any) => {
    if (!tooltip) return null;
    return <div role="tooltip">{tooltip.content}</div>;
  }
}));

describe('AgentThinkingSidebar', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders stats line and activity (brain) button when expanded', () => {
    const sessionActivity = [
      { id: 'e1', created_at: new Date().toISOString(), story: [{ id: 's1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() }] },
    ];
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} sessionActivity={sessionActivity} />
    );
    expect(screen.getByRole('button', { name: 'Activity', hidden: true })).toBeTruthy();
    expect(screen.getByTitle('Total actions')).toBeTruthy();
  });

  it('does not show stats row when collapsed', () => {
    render(
      <AgentThinkingSidebar isCollapsed onToggle={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: 'Activity', hidden: true })).toBeNull();
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

  it('highlights suspicious failure phrases in reasoning activity block', () => {
    const storyItems = [
      { id: '1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() },
      {
        id: '2',
        type: 'reasoning_start',
        message: '',
        timestamp: new Date().toISOString(),
        details: 'But authentication fails. Trying fallback.',
      },
    ];
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} storyItems={storyItems} />
    );
    const mark = document.querySelector('mark[title="Possible failure — check token or access"]');
    expect(mark).toBeTruthy();
    expect(mark?.textContent).toContain('authentication fails');
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

  it('expanded panel has scrollable activity area', () => {
    const sessionActivity = [
      {
        id: 'e1',
        created_at: new Date().toISOString(),
        story: [
          { id: 's1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() },
          { id: 's2', type: 'tool_call', message: 'Ran', timestamp: new Date().toISOString(), command: 'ls' },
        ],
      },
    ];
    render(
      <AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} sessionActivity={sessionActivity} />
    );
    const scrollArea = document.querySelector('.overflow-y-auto');
    expect(scrollArea).toBeTruthy();
    expect(screen.getByPlaceholderText('Search activity...')).toBeTruthy();
  });

  it('collapsed panel with activity has scrollable summary container', () => {
    const storyItems = [
      { id: '1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() },
      { id: '2', type: 'tool_call', message: 'Ran', timestamp: new Date().toISOString(), command: 'pwd' },
    ];
    const { container } = render(
      <AgentThinkingSidebar isCollapsed onToggle={vi.fn()} storyItems={storyItems} isStreaming={false} />
    );
    const summary = container.querySelector('[aria-label="Activity summary"]');
    expect(summary).toBeTruthy();
    expect(summary?.classList.contains('overflow-y-auto')).toBe(true);
  });

  it('calls onActivityClick with activityId and storyId when clicking a session activity entry', () => {
    const onActivityClick = vi.fn();
    const sessionActivity = [
      {
        id: 'act-uuid-1',
        created_at: new Date().toISOString(),
        story: [
          { id: 's1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() },
          { id: 's2', type: 'tool_call', message: 'Ran', timestamp: new Date().toISOString(), command: 'ls' },
        ],
      },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        sessionActivity={sessionActivity}
        onActivityClick={onActivityClick}
      />
    );
    const lsButton = screen.getByText('ls').closest('button');
    if (lsButton) fireEvent.click(lsButton);
    expect(onActivityClick).toHaveBeenCalledTimes(1);
    expect(onActivityClick).toHaveBeenCalledWith({ activityId: 'act-uuid-1', storyId: 's2' });
  });

  it('calls onActivityClick with activityId and storyId when clicking stream_start entry in list', () => {
    const onActivityClick = vi.fn();
    const sessionActivity = [
      {
        id: 'latest-act',
        created_at: new Date().toISOString(),
        story: [
          { id: 'e1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() },
        ],
      },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        sessionActivity={sessionActivity}
        isStreaming
        onActivityClick={onActivityClick}
      />
    );
    const thinkingButtons = screen.getAllByText('Thinking...');
    const listEntryButton = thinkingButtons[0].closest('button');
    if (listEntryButton) fireEvent.click(listEntryButton);
    expect(onActivityClick).toHaveBeenCalledTimes(1);
    expect(onActivityClick).toHaveBeenCalledWith({ activityId: 'latest-act', storyId: 'e1' });
  });

  it('calls onActivityClick with activityId only when clicking bottom reasoning block', () => {
    const onActivityClick = vi.fn();
    const sessionActivity = [
      {
        id: 'act-1',
        created_at: new Date().toISOString(),
        story: [
          { id: 'e1', type: 'stream_start', message: 'Started', timestamp: new Date().toISOString() },
        ],
      },
    ];
    render(
      <AgentThinkingSidebar
        isCollapsed={false}
        onToggle={vi.fn()}
        sessionActivity={sessionActivity}
        reasoningText="Current reasoning content"
        onActivityClick={onActivityClick}
      />
    );
    const reasoningButton = screen.getByText(/Current reasoning content/).closest('button');
    if (reasoningButton) fireEvent.click(reasoningButton);
    expect(onActivityClick).toHaveBeenCalledTimes(1);
    expect(onActivityClick).toHaveBeenCalledWith({ activityId: 'act-1' });
  });

  it('calls onActivityClick with activityId and storyId when clicking command group wrapper', () => {
    const onActivityClick = vi.fn();
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
        onActivityClick={onActivityClick}
      />
    );
    const innerExpandButton = screen.getByText(/3 commands/).closest('button');
    const outerWrapperButton = innerExpandButton?.parentElement?.parentElement as HTMLButtonElement;
    fireEvent.click(outerWrapperButton);
    expect(onActivityClick).toHaveBeenCalledTimes(1);
    expect(onActivityClick).toHaveBeenCalledWith({ activityId: '1', storyId: '1' });
  });

  describe('Search and Activity Filtering', () => {
    it('updates search query and clears it', () => {
      render(<AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} storyItems={[]} />);
      const input = screen.getByPlaceholderText('Search activity...');
      fireEvent.change(input, { target: { value: 'test search' } });
      expect(input).toHaveProperty('value', 'test search');

      const clearBtn = screen.getByRole('button', { name: 'Clear search' });
      fireEvent.click(clearBtn);
      expect(input).toHaveProperty('value', '');
    });

    it('shows no activity matches text when search yields no results', () => {
      const storyItems = [{ id: '1', type: 'tool_call', message: 'xyz123', timestamp: new Date().toISOString() }];
      render(<AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} storyItems={storyItems} />);
      
      const input = screen.getByPlaceholderText('Search activity...');
      fireEvent.change(input, { target: { value: 'notfound' } });
      expect(screen.getByText(/No activity matches "notfound"/)).toBeTruthy();
    });
  });

  describe('Collapsed view tooltips', () => {
    it('sets tooltip on mouse enter and clears on mouse leave', async () => {
      const storyItems = [{ id: '1', type: 'tool_call', message: 'Command', timestamp: new Date().toISOString(), command: 'Step content' }];
      const { container } = render(
        <AgentThinkingSidebar isCollapsed onToggle={vi.fn()} storyItems={storyItems} />
      );
      const dot = container.querySelector('span[title="$ Step content"]');
      expect(dot).toBeTruthy();

      if (dot) fireEvent.mouseEnter(dot);
      await waitFor(() => {
        expect(screen.getByText('$ Step content')).toBeTruthy();
      });

      if (dot) fireEvent.mouseLeave(dot);
      await waitFor(() => {
        expect(screen.queryByRole('tooltip')).toBeNull();
      });
    });
  });

  describe('Copy and Animations', () => {
    let writeTextMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();
      writeTextMock = vi.fn().mockResolvedValue(true);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextMock }, writable: true });
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('copies payload to clipboard and runs animation when completely collapsed', async () => {
      const sessionActivity = [{ id: 'e1', created_at: '2025', story: [{ id: '1', type: 'step', message: 'Test', timestamp: '2025' }] }];
      render(<AgentThinkingSidebar isCollapsed onToggle={vi.fn()} sessionActivity={sessionActivity} />);
      
      const btn = screen.getByRole('button', { name: 'Copy activity to clipboard' });
      await act(async () => {
        fireEvent.click(btn);
        await Promise.resolve();
      });

      expect(writeTextMock).toHaveBeenCalled();
      const payload = JSON.parse(writeTextMock.mock.calls[0][0]);
      expect(payload.sessionStats.totalActions).toBe(1);

      // Verify button is disabled during animation
      expect(btn.hasAttribute('disabled')).toBe(true);

      // Fast forward to clear animation
      act(() => { vi.advanceTimersByTime(2500); });
      expect(btn.hasAttribute('disabled')).toBe(false);
    });
  });

  describe('Virtualized rendering', () => {
    it('renders natively without virtualization when items are few', () => {
      const storyItems = Array.from({ length: 5 }).map((_, i) => ({
        id: `id${i}`, type: 'step', message: `msg${i}`, timestamp: new Date().toISOString()
      }));
      const { container } = render(<AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} storyItems={storyItems} />);
      // Should not use absolute positioning when not virtualized
      const rows = container.querySelectorAll('.absolute.left-0.w-full');
      expect(rows.length).toBe(0);
    });

    it('uses virtualizer and renders correct window when items exceed threshold of 15', async () => {
      const storyItems = Array.from({ length: 20 }).map((_, i) => ({
        id: `id${i}`, type: i % 2 === 0 ? 'tool_call' : 'file_created', message: `msg${i}`, timestamp: new Date().toISOString(), command: `cmd${i}`
      }));

      // In JSDOM with our mock, components exceeding 15 items will render exactly 5 absolute-positioned rows
      const { container } = render(<AgentThinkingSidebar isCollapsed={false} onToggle={vi.fn()} storyItems={storyItems} />);
      
      await waitFor(() => {
        const virtualRows = container.querySelectorAll('.absolute.left-0.w-full');
        expect(virtualRows.length).toBe(5);
      });
    });
  });
});
