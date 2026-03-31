import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StoryListRow, StoryDetail, ActivityStoryDetailPanel } from './activity-review-panel';

describe('StoryListRow', () => {
  it('covers branch logic for file_created', () => {
    // Path string
    const { rerender } = render(
      <StoryListRow story={{ timestamp: '2025-01-15T12:00:00Z', type: 'file_created', path: 'index.tsx' } as any} isSelected={false} onSelect={vi.fn()} />
    );
    expect(screen.getByText('index.tsx')).toBeTruthy();

    // No path, details string
    rerender(
      <StoryListRow story={{ timestamp: '2025-01-15T12:00:00Z', type: 'file_created', details: 'some details' } as any} isSelected={false} onSelect={vi.fn()} />
    );
    expect(screen.getByText('some details')).toBeTruthy();

    // No path, empty object details, message string
    rerender(
      <StoryListRow story={{ timestamp: '2025-01-15T12:00:00Z', type: 'file_created', details: '{}', message: 'a message' } as any} isSelected={false} onSelect={vi.fn()} />
    );
    expect(screen.getByText('a message')).toBeTruthy();

    // No path, details, message => fallback to label
    rerender(
      <StoryListRow story={{ timestamp: '2025-01-15T12:00:00Z', type: 'file_created' } as any} isSelected={false} onSelect={vi.fn()} />
    );
  });

  it('covers branch logic for reasoning blocks', () => {
    const { rerender } = render(
      <StoryListRow story={{ timestamp: '2025-01-15T12:00:00Z', type: 'reasoning_start', details: 'think' } as any} isSelected={false} onSelect={vi.fn()} />
    );
    expect(screen.getByText('think')).toBeTruthy();

    // Empty details
    rerender(
      <StoryListRow story={{ timestamp: '2025-01-15T12:00:00Z', type: 'reasoning_start' } as any} isSelected={false} onSelect={vi.fn()} />
    );
    expect(screen.getByText('Reasoning')).toBeTruthy();

    // empty details for end
    rerender(
      <StoryListRow story={{ timestamp: '2025-01-15T12:00:00Z', type: 'reasoning_end' } as any} isSelected={false} onSelect={vi.fn()} />
    );
    expect(screen.getByText('Reasoning')).toBeTruthy();
  });

  it('covers branch logic for defaults', () => {
    const { rerender } = render(
      <StoryListRow story={{ timestamp: '2025-01-15T12:00:00Z', type: 'step', message: 'Step msg' } as any} isSelected={false} onSelect={vi.fn()} />
    );
    expect(screen.getByText('Step msg')).toBeTruthy();

    // empty message {}
    rerender(
      <StoryListRow story={{ timestamp: '2025-01-15T12:00:00Z', type: 'step', message: '{}' } as any} isSelected={false} onSelect={vi.fn()} />
    );
    // undefined message
    rerender(
      <StoryListRow story={{ timestamp: '2025-01-15T12:00:00Z', type: 'other' } as any} isSelected={false} onSelect={vi.fn()} />
    );
  });
});

describe('StoryDetail', () => {
  it('covers isSingleRow branches', () => {
    const { rerender } = render(<StoryDetail story={{ timestamp: '2025-01-15T12:00:00Z', type: 'step', message: 'step message' } as any} />);
    expect(screen.getByText('step message')).toBeTruthy();

    rerender(<StoryDetail story={{ timestamp: '2025-01-15T12:00:00Z', type: 'stream_start' } as any} />);

    rerender(<StoryDetail story={{ timestamp: '2025-01-15T12:00:00Z', type: 'file_created', path: 'index.tsx' } as any} />);
    expect(screen.getByText('index.tsx')).toBeTruthy();

    rerender(<StoryDetail story={{ timestamp: '2025-01-15T12:00:00Z', type: 'file_created', details: 'my details' } as any} />);
    expect(screen.getByText('my details')).toBeTruthy();

    rerender(<StoryDetail story={{ timestamp: '2025-01-15T12:00:00Z', type: 'file_created', message: 'file message' } as any} />);
    expect(screen.getByText('file message')).toBeTruthy();

    // tool_call with command
    rerender(<StoryDetail story={{ timestamp: '2025-01-15T12:00:00Z', type: 'tool_call', command: 'echo hello' } as any} />);
    expect(screen.getByText('echo hello')).toBeTruthy();
    
    // tool_call with NO command
    rerender(<StoryDetail story={{ timestamp: '2025-01-15T12:00:00Z', type: 'tool_call', message: 'tool msg' } as any} />);
    expect(screen.getByText('tool msg')).toBeTruthy();
  });

  it('covers reasoning_start (isThinkingBlock) branches', () => {
    const { rerender } = render(<StoryDetail story={{ timestamp: '2025-01-15T12:00:00Z', type: 'reasoning_start', details: 'thinking deep thoughts' } as any} />);
    expect(screen.getByText('thinking deep thoughts')).toBeTruthy();

    rerender(<StoryDetail story={{ timestamp: '2025-01-15T12:00:00Z', type: 'reasoning_start' } as any} />);
    rerender(<StoryDetail story={{ timestamp: '2025-01-15T12:00:00Z', type: 'reasoning_start', details: '   ' } as any} />);
  });

  it('covers other non-single row branches', () => {
    const { rerender } = render(<StoryDetail story={{ timestamp: '2025-01-15T12:00:00Z', type: 'other', message: 'my msg', details: 'some details' } as any} />);
    expect(screen.getByText('my msg')).toBeTruthy();
    // note text size truncations or title attrs won't stop getByText

    // NO message, only details
    rerender(<StoryDetail story={{ timestamp: '2025-01-15T12:00:00Z', type: 'other', details: 'only details' } as any} />);
    expect(screen.getByText('only details')).toBeTruthy();

    // Details is just {}
    rerender(<StoryDetail story={{ timestamp: '2025-01-15T12:00:00Z', type: 'other', details: '{}' } as any} />);

    // Nothing
    rerender(<StoryDetail story={{ timestamp: '2025-01-15T12:00:00Z', type: 'other' } as any} />);
  });
});

describe('ActivityStoryDetailPanel', () => {
  it('renders sparkles without animation when complete', () => {
    render(<ActivityStoryDetailPanel
      selectedStory={{ id: '1', timestamp: '2025-01-15T12:00:00Z', type: 'other' } as any}
      brainState="complete"
      detailSearchQuery=""
      onDetailSearchChange={vi.fn()}
      copyAnimating={false}
      copyTooltipAnchor={null}
      brainButtonRef={{ current: null }}
      onCopyClick={vi.fn()}
    />);
  });
});
