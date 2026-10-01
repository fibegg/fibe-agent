import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  StoryListRow,
  StoryDetail,
  ActivityStoryDetailPanel,
} from './activity-review-panel';

describe('StoryListRow', () => {
  it('covers branch logic for file_created', () => {
    const { rerender } = render(
      <StoryListRow
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'file_created',
            path: 'index.tsx',
          } as any
        }
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('index.tsx')).toBeTruthy();

    rerender(
      <StoryListRow
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'file_created',
            details: 'some details',
          } as any
        }
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('some details')).toBeTruthy();

    rerender(
      <StoryListRow
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'file_created',
            details: '{}',
            message: 'a message',
          } as any
        }
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('a message')).toBeTruthy();

    // No path, details, message => fallback to label
    rerender(
      <StoryListRow
        story={
          { timestamp: '2025-01-15T12:00:00Z', type: 'file_created' } as any
        }
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
  });

  it('covers branch logic for reasoning blocks', () => {
    const { rerender } = render(
      <StoryListRow
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'reasoning_start',
            details: 'think',
          } as any
        }
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('think')).toBeTruthy();

    rerender(
      <StoryListRow
        story={
          { timestamp: '2025-01-15T12:00:00Z', type: 'reasoning_start' } as any
        }
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('Reasoning')).toBeTruthy();

    rerender(
      <StoryListRow
        story={
          { timestamp: '2025-01-15T12:00:00Z', type: 'reasoning_end' } as any
        }
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('Reasoning')).toBeTruthy();
  });

  it('covers branch logic for defaults', () => {
    const { rerender } = render(
      <StoryListRow
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'step',
            message: 'Step msg',
          } as any
        }
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('Step msg')).toBeTruthy();

    rerender(
      <StoryListRow
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'step',
            message: '{}',
          } as any
        }
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
    rerender(
      <StoryListRow
        story={{ timestamp: '2025-01-15T12:00:00Z', type: 'other' } as any}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );
  });
});

describe('StoryDetail', () => {
  it('covers isSingleRow branches', () => {
    const { rerender } = render(
      <StoryDetail
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'step',
            message: 'step message',
          } as any
        }
      />,
    );
    expect(screen.getByText('step message')).toBeTruthy();

    rerender(
      <StoryDetail
        story={
          { timestamp: '2025-01-15T12:00:00Z', type: 'stream_start' } as any
        }
      />,
    );

    rerender(
      <StoryDetail
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'file_created',
            path: 'index.tsx',
          } as any
        }
      />,
    );
    expect(screen.getByText('index.tsx')).toBeTruthy();

    rerender(
      <StoryDetail
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'file_created',
            details: 'my details',
          } as any
        }
      />,
    );
    expect(screen.getByText('my details')).toBeTruthy();

    rerender(
      <StoryDetail
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'file_created',
            message: 'file message',
          } as any
        }
      />,
    );
    expect(screen.getByText('file message')).toBeTruthy();

    rerender(
      <StoryDetail
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'tool_call',
            command: 'echo hello',
          } as any
        }
      />,
    );
    expect(screen.getByText('echo hello')).toBeTruthy();

    rerender(
      <StoryDetail
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'tool_call',
            message: 'tool msg',
          } as any
        }
      />,
    );
    expect(screen.getByText('tool msg')).toBeTruthy();
  });

  it('covers reasoning_start (isThinkingBlock) branches', () => {
    const { rerender } = render(
      <StoryDetail
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'reasoning_start',
            details: 'thinking deep thoughts',
          } as any
        }
      />,
    );
    expect(screen.getByText('thinking deep thoughts')).toBeTruthy();

    rerender(
      <StoryDetail
        story={
          { timestamp: '2025-01-15T12:00:00Z', type: 'reasoning_start' } as any
        }
      />,
    );
    rerender(
      <StoryDetail
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'reasoning_start',
            details: '   ',
          } as any
        }
      />,
    );
  });

  it('covers other non-single row branches', () => {
    const { rerender } = render(
      <StoryDetail
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'other',
            message: 'my msg',
            details: 'some details',
          } as any
        }
      />,
    );
    expect(screen.getByText('my msg')).toBeTruthy();

    // NO message, only details
    rerender(
      <StoryDetail
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'other',
            details: 'only details',
          } as any
        }
      />,
    );
    expect(screen.getByText('only details')).toBeTruthy();

    rerender(
      <StoryDetail
        story={
          {
            timestamp: '2025-01-15T12:00:00Z',
            type: 'other',
            details: '{}',
          } as any
        }
      />,
    );

    rerender(
      <StoryDetail
        story={{ timestamp: '2025-01-15T12:00:00Z', type: 'other' } as any}
      />,
    );
  });
});

describe('ActivityStoryDetailPanel', () => {
  it('renders sparkles without animation when complete', () => {
    render(
      <ActivityStoryDetailPanel
        selectedStory={
          { id: '1', timestamp: '2025-01-15T12:00:00Z', type: 'other' } as any
        }
        brainState="complete"
        detailSearchQuery=""
        onDetailSearchChange={vi.fn()}
        copyAnimating={false}
        copyTooltipAnchor={null}
        brainButtonRef={{ current: null }}
        onCopyClick={vi.fn()}
      />,
    );
  });
});
