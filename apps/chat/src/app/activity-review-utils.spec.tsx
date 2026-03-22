import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  getTypeFilterLabel,
  commandLabel,
  getCopyableStoryText,
  getCopyableActivityText,
  escapeRegex,
  highlightText,
  reasoningBodyWithHighlights,
  SINGLE_ROW_TYPES,
  ACTIVITY_TYPE_FILTERS,
  BADGE_ACTIVE_STYLES,
  BADGE_INACTIVE_STYLES,
} from './activity-review-utils';

describe('SINGLE_ROW_TYPES', () => {
  it('contains expected types', () => {
    expect(SINGLE_ROW_TYPES.has('stream_start')).toBe(true);
    expect(SINGLE_ROW_TYPES.has('step')).toBe(true);
    expect(SINGLE_ROW_TYPES.has('tool_call')).toBe(true);
    expect(SINGLE_ROW_TYPES.has('file_created')).toBe(true);
    expect(SINGLE_ROW_TYPES.has('reasoning')).toBe(false);
  });
});

describe('ACTIVITY_TYPE_FILTERS', () => {
  it('has all expected filter keys', () => {
    expect(ACTIVITY_TYPE_FILTERS).toContain('reasoning');
    expect(ACTIVITY_TYPE_FILTERS).toContain('stream_start');
    expect(ACTIVITY_TYPE_FILTERS).toContain('task_complete');
  });
});

describe('BADGE_ACTIVE_STYLES', () => {
  it('has entries for all filter types', () => {
    for (const t of ACTIVITY_TYPE_FILTERS) {
      expect(BADGE_ACTIVE_STYLES[t]).toBeTruthy();
    }
  });
});

describe('BADGE_INACTIVE_STYLES', () => {
  it('has entries for all filter types', () => {
    for (const t of ACTIVITY_TYPE_FILTERS) {
      expect(BADGE_INACTIVE_STYLES[t]).toBeTruthy();
    }
  });
});

describe('getTypeFilterLabel', () => {
  it('returns Reasoning for reasoning', () => {
    expect(getTypeFilterLabel('reasoning')).toBe('Reasoning');
  });

  it('returns Complete for task_complete', () => {
    expect(getTypeFilterLabel('task_complete')).toBe('Complete');
  });

  it('returns label from getActivityLabel for known types', () => {
    const result = getTypeFilterLabel('stream_start');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty string for null key', () => {
    const result = getTypeFilterLabel(null);
    expect(typeof result).toBe('string');
  });
});

describe('commandLabel', () => {
  it('returns command when present', () => {
    const entry = { type: 'tool_call', command: 'ls -la' } as Parameters<typeof commandLabel>[0];
    expect(commandLabel(entry)).toBe('ls -la');
  });

  it('uses message when no command', () => {
    const entry = { type: 'step', message: 'Ran something' } as Parameters<typeof commandLabel>[0];
    expect(commandLabel(entry)).toBe('something');
  });

  it('strips "Ran " prefix from message', () => {
    const entry = { type: 'step', message: 'Ran the tests' } as Parameters<typeof commandLabel>[0];
    expect(commandLabel(entry)).toBe('the tests');
  });

  it('returns activity label for empty message', () => {
    const entry = { type: 'stream_start', message: '{}' } as Parameters<typeof commandLabel>[0];
    const result = commandLabel(entry);
    expect(typeof result).toBe('string');
  });

  it('falls back to type when no command, no message', () => {
    const entry = { type: 'some_type' } as Parameters<typeof commandLabel>[0];
    const result = commandLabel(entry);
    expect(typeof result).toBe('string');
  });
});

describe('getCopyableStoryText', () => {
  it('includes label and message', () => {
    const story = {
      id: '1',
      type: 'step',
      message: 'Hello world',
      timestamp: '2024-01-01T12:00:00Z',
    } as Parameters<typeof getCopyableStoryText>[0];
    const result = getCopyableStoryText(story);
    expect(result).toContain('Hello world');
  });

  it('includes details if present and not {}', () => {
    const story = {
      id: '1',
      type: 'step',
      message: 'msg',
      timestamp: '2024-01-01T12:00:00Z',
      details: 'some details',
    } as Parameters<typeof getCopyableStoryText>[0];
    const result = getCopyableStoryText(story);
    expect(result).toContain('some details');
  });

  it('skips details if it is {}', () => {
    const story = {
      id: '1',
      type: 'step',
      message: 'msg',
      timestamp: '2024-01-01T12:00:00Z',
      details: '{}',
    } as Parameters<typeof getCopyableStoryText>[0];
    const result = getCopyableStoryText(story);
    expect(result).not.toContain('{}');
  });

  it('appends command for tool_call type', () => {
    const story = {
      id: '1',
      type: 'tool_call',
      message: 'msg',
      timestamp: '2024-01-01T12:00:00Z',
      command: 'echo hello',
    } as Parameters<typeof getCopyableStoryText>[0];
    const result = getCopyableStoryText(story);
    expect(result).toContain('$ echo hello');
  });

  it('appends path for file_created type', () => {
    const story = {
      id: '1',
      type: 'file_created',
      message: 'msg',
      timestamp: '2024-01-01T12:00:00Z',
      path: '/some/file.ts',
    } as Parameters<typeof getCopyableStoryText>[0];
    const result = getCopyableStoryText(story);
    expect(result).toContain('/some/file.ts');
  });

  it('handles missing timestamp', () => {
    const story = {
      id: '1',
      type: 'step',
      message: 'msg',
    } as Parameters<typeof getCopyableStoryText>[0];
    const result = getCopyableStoryText(story);
    expect(typeof result).toBe('string');
  });
});

describe('getCopyableActivityText', () => {
  it('joins multiple story entries with separator', () => {
    const stories = [
      { id: '1', type: 'step', message: 'first' },
      { id: '2', type: 'step', message: 'second' },
    ] as Parameters<typeof getCopyableActivityText>[0];
    const result = getCopyableActivityText(stories);
    expect(result).toContain('first');
    expect(result).toContain('second');
    expect(result).toContain('---');
  });

  it('returns empty string for empty array', () => {
    expect(getCopyableActivityText([])).toBe('');
  });
});

describe('escapeRegex', () => {
  it('escapes special regex characters', () => {
    expect(escapeRegex('a.b*c')).toBe('a\\.b\\*c');
    expect(escapeRegex('[test]')).toBe('\\[test\\]');
    expect(escapeRegex('(a|b)')).toBe('\\(a\\|b\\)');
  });

  it('leaves plain strings unchanged', () => {
    expect(escapeRegex('hello')).toBe('hello');
  });
});

describe('highlightText', () => {
  it('returns plain text when query is empty', () => {
    const result = highlightText('hello world', '');
    expect(result).toBe('hello world');
  });

  it('returns plain text when query is whitespace', () => {
    const result = highlightText('hello world', '   ');
    expect(result).toBe('hello world');
  });

  it('wraps matching segments in mark elements', () => {
    const result = highlightText('hello world', 'hello');
    const { container } = render(<>{result}</>);
    expect(container.querySelectorAll('mark').length).toBeGreaterThan(0);
    expect(container.querySelector('mark')?.textContent).toBe('hello');
  });

  it('is case-insensitive', () => {
    const result = highlightText('Hello World', 'hello');
    const { container } = render(<>{result}</>);
    expect(container.querySelectorAll('mark').length).toBeGreaterThan(0);
  });
});

describe('reasoningBodyWithHighlights', () => {
  it('returns raw details when no segments', () => {
    // Plain text with no patterns returns the string
    const result = reasoningBodyWithHighlights('', 'query');
    expect(result).toBe('');
  });

  it('renders segments from details', () => {
    const text = 'This looks correct and is definitely fine.';
    const result = reasoningBodyWithHighlights(text, '');
    const { container } = render(<>{result}</>);
    expect(container.textContent?.length).toBeGreaterThan(0);
  });

  it('applies highlight within segments when query provided', () => {
    const text = 'Wait, I should reconsider actually this approach.';
    const result = reasoningBodyWithHighlights(text, 'reconsider');
    const { container } = render(<>{result}</>);
    expect(container.textContent).toContain('reconsider');
  });
});
