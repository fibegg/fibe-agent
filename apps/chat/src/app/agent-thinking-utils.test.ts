import { describe, it, expect } from 'vitest';
import {
  buildFullStoryItems,
  ensureUniqueStoryIds,
  filterVisibleStoryItems,
  formatCompactInteger,
  formatSessionDurationMs,
  getActivityIcon,
  getActivityLabel,
  getBlockVariant,
  toTimestampMs,
} from './agent-thinking-utils';
import type { StoryEntry } from './agent-thinking-utils';

describe('getActivityLabel', () => {
  it('returns Started for stream_start', () => {
    expect(getActivityLabel('stream_start')).toBe('Started');
  });

  it('returns empty string for reasoning_start and reasoning_end', () => {
    expect(getActivityLabel('reasoning_start')).toBe('');
    expect(getActivityLabel('reasoning_end')).toBe('');
  });

  it('returns Step for step', () => {
    expect(getActivityLabel('step')).toBe('Step');
  });

  it('returns File for file_created', () => {
    expect(getActivityLabel('file_created')).toBe('File');
  });

  it('returns Command for tool_call', () => {
    expect(getActivityLabel('tool_call')).toBe('Command');
  });

  it('returns Info for info', () => {
    expect(getActivityLabel('info')).toBe('Info');
  });

  it('returns Activity for unknown type', () => {
    expect(getActivityLabel('unknown')).toBe('Activity');
  });
});

describe('getBlockVariant', () => {
  it('returns stream_start for stream_start entry', () => {
    expect(getBlockVariant({ id: '1', type: 'stream_start', message: '', timestamp: '' })).toBe('stream_start');
  });

  it('returns reasoning for reasoning_start and reasoning_end', () => {
    expect(getBlockVariant({ id: '1', type: 'reasoning_start', message: '', timestamp: '' })).toBe('reasoning');
    expect(getBlockVariant({ id: '1', type: 'reasoning_end', message: '', timestamp: '' })).toBe('reasoning');
  });

  it('returns tool_call for tool_call entry', () => {
    expect(getBlockVariant({ id: '1', type: 'tool_call', message: '', timestamp: '' })).toBe('tool_call');
  });

  it('returns file_created for file_created entry', () => {
    expect(getBlockVariant({ id: '1', type: 'file_created', message: '', timestamp: '' })).toBe('file_created');
  });

  it('returns task_complete for task_complete entry', () => {
    expect(getBlockVariant({ id: '1', type: 'task_complete', message: '', timestamp: '' })).toBe('task_complete');
  });

  it('returns default for unknown type', () => {
    expect(getBlockVariant({ id: '1', type: 'other', message: '', timestamp: '' })).toBe('default');
  });
});

describe('getActivityIcon', () => {
  it('returns a component for known types', () => {
    expect(getActivityIcon('stream_start')).toBeDefined();
    expect(getActivityIcon('tool_call')).toBeDefined();
    expect(getActivityIcon('step')).toBeDefined();
  });
});

describe('toTimestampMs', () => {
  it('returns fallback date time when ts is undefined', () => {
    const t = toTimestampMs(undefined, '2020-01-01T00:00:00.000Z');
    expect(t).toBe(new Date('2020-01-01T00:00:00.000Z').getTime());
  });

  it('parses ISO string', () => {
    expect(toTimestampMs('2020-06-15T12:00:00.000Z', '')).toBe(1592222400000);
  });

  it('uses getTime for Date object', () => {
    const d = new Date('2020-06-15T12:00:00.000Z');
    expect(toTimestampMs(d, '')).toBe(d.getTime());
  });
});

describe('formatSessionDurationMs', () => {
  it('returns 0s for under 1 second', () => {
    expect(formatSessionDurationMs(500)).toBe('0s');
  });

  it('includes seconds only for under 60 seconds', () => {
    expect(formatSessionDurationMs(5000)).toBe('5s');
  });

  it('includes minutes and seconds', () => {
    expect(formatSessionDurationMs(125000)).toBe('2m 5s');
  });

  it('includes hours when present', () => {
    expect(formatSessionDurationMs(3665000)).toBe('1h 1m 5s');
  });
});

describe('formatCompactInteger', () => {
  it('returns plain number when under 1000', () => {
    expect(formatCompactInteger(0)).toBe('0');
    expect(formatCompactInteger(999)).toBe('999');
  });

  it('formats thousands with k', () => {
    expect(formatCompactInteger(1000)).toBe('1k');
    expect(formatCompactInteger(1500)).toBe('1.5k');
    expect(formatCompactInteger(12345)).toBe('12.3k');
  });

  it('formats millions with M', () => {
    expect(formatCompactInteger(1_000_000)).toBe('1M');
    expect(formatCompactInteger(1_500_000)).toBe('1.5M');
    expect(formatCompactInteger(12_300_000)).toBe('12.3M');
  });
});

describe('filterVisibleStoryItems', () => {
  const visibleEntry: StoryEntry = {
    id: '1',
    type: 'stream_start',
    message: 'Started',
    timestamp: new Date().toISOString(),
  };

  const hiddenEntry: StoryEntry = {
    id: '2',
    type: 'AskUserQuestion',
    message: 'Ask user',
    timestamp: new Date().toISOString(),
  };

  it('returns all entries when none are hidden', () => {
    const result = filterVisibleStoryItems([visibleEntry]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('stream_start');
  });

  it('excludes AskUserQuestion entries', () => {
    const result = filterVisibleStoryItems([visibleEntry, hiddenEntry, visibleEntry]);
    expect(result).toHaveLength(2);
    expect(result.every((e: StoryEntry) => e.type !== 'AskUserQuestion')).toBe(true);
  });

  it('returns empty array when all are hidden', () => {
    const result = filterVisibleStoryItems([hiddenEntry]);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(filterVisibleStoryItems([])).toEqual([]);
  });
});

describe('ensureUniqueStoryIds', () => {
  it('returns entries unchanged when all ids are unique', () => {
    const entries: StoryEntry[] = [
      { id: 'a', type: 'stream_start', message: '', timestamp: '' },
      { id: 'b', type: 'reasoning_start', message: '', timestamp: '', details: 'x' },
    ];
    const result = ensureUniqueStoryIds(entries);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('b');
  });

  it('assigns unique ids to duplicate ids by appending suffix', () => {
    const entries: StoryEntry[] = [
      { id: 'same', type: 'reasoning_start', message: '', timestamp: '', details: 'first' },
      { id: 'same', type: 'reasoning_start', message: '', timestamp: '', details: 'second' },
    ];
    const result = ensureUniqueStoryIds(entries);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('same');
    expect(result[1].id).toBe('same-1');
    expect(result[0].details).toBe('first');
    expect(result[1].details).toBe('second');
  });

  it('assigns generated id when id is missing', () => {
    const entries = [{ type: 'reasoning_start', message: '', timestamp: '' }] as StoryEntry[];
    const result = ensureUniqueStoryIds(entries);
    expect(result).toHaveLength(1);
    expect(result[0].id).toMatch(/^story-\d+$/);
  });

  it('assigns generated id when id is empty string', () => {
    const entries = [{ id: '', type: 'step', message: 'x', timestamp: '' }] as StoryEntry[];
    const result = ensureUniqueStoryIds(entries);
    expect(result).toHaveLength(1);
    expect(result[0].id).toMatch(/^story-\d+$/);
  });

  it('dedupes entries with same id and same content', () => {
    const entries: StoryEntry[] = [
      { id: 'r1', type: 'reasoning_start', message: 'Thinking', timestamp: '', details: 'Same block' },
      { id: 'r1', type: 'reasoning_start', message: 'Thinking', timestamp: '', details: 'Same block' },
    ];
    const result = ensureUniqueStoryIds(entries);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
    expect(result[0].details).toBe('Same block');
  });
});

describe('buildFullStoryItems', () => {
  it('keeps all reasoning blocks when they have duplicate ids and different content', () => {
    const sessionActivity = [
      {
        id: 'act-1',
        created_at: new Date().toISOString(),
        story: [
          { id: 'e1', type: 'stream_start', message: 'Started', timestamp: '' },
          { id: 'r1', type: 'reasoning_start', message: 'Thinking', timestamp: '', details: 'Block one' },
          { id: 'r1', type: 'reasoning_start', message: 'Thinking', timestamp: '', details: 'Block two' },
        ],
      },
    ];
    const result = buildFullStoryItems(sessionActivity, [], []);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('e1');
    expect(result[1].id).toBe('r1');
    expect(result[2].id).toBe('r1-1');
    expect(result[1].details).toBe('Block one');
    expect(result[2].details).toBe('Block two');
  });

  it('dedupes same entry when present in both session and storyItems', () => {
    const block = { id: 'r1', type: 'reasoning_start', message: 'Thinking', timestamp: '', details: 'Same block' };
    const sessionActivity = [{ id: 'act-1', created_at: new Date().toISOString(), story: [block] }];
    const storyItems = [{ ...block }];
    const result = buildFullStoryItems(sessionActivity, [], storyItems);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
    expect(result[0].details).toBe('Same block');
  });
});
