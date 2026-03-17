import { describe, it, expect } from 'vitest';
import {
  buildFullStoryItems,
  computeSessionStats,
  filterVisibleStoryItems,
  type SessionActivityEntryLike,
  type StoryEntry,
} from './agent-thinking-utils';

function entry(id: string, type: string, timestamp = new Date().toISOString()): StoryEntry {
  return { id, type, message: '', timestamp };
}

describe('filterVisibleStoryItems', () => {
  it('filters out AskUserQuestion entries', () => {
    const items = [
      entry('1', 'stream_start'),
      entry('2', 'AskUserQuestion'),
      entry('3', 'step'),
    ];
    expect(filterVisibleStoryItems(items)).toHaveLength(2);
    expect(filterVisibleStoryItems(items).map((e) => e.type)).toEqual(['stream_start', 'step']);
  });

  it('returns all entries when none are hidden', () => {
    const items = [entry('1', 'tool_call'), entry('2', 'task_complete')];
    expect(filterVisibleStoryItems(items)).toHaveLength(2);
  });
});

describe('buildFullStoryItems', () => {
  it('merges session past and story items and dedupes by id', () => {
    const session: SessionActivityEntryLike[] = [
      { id: 's1', created_at: '', story: [entry('a', 'step'), entry('b', 'step')] },
    ];
    const past: SessionActivityEntryLike[] = [
      { id: 'p1', created_at: '', story: [entry('b', 'step'), entry('c', 'step')] },
    ];
    const story = [entry('c', 'step'), entry('d', 'step')];
    const result = buildFullStoryItems(session, past, story);
    expect(result.map((e) => e.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('filters visible only', () => {
    const session: SessionActivityEntryLike[] = [
      { id: 's1', created_at: '', story: [entry('1', 'AskUserQuestion'), entry('2', 'step')] },
    ];
    const result = buildFullStoryItems(session, [], []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('returns empty when no activity', () => {
    expect(buildFullStoryItems([], [], [])).toEqual([]);
  });
});

describe('computeSessionStats', () => {
  it('returns zeros when no items', () => {
    expect(
      computeSessionStats([], [], [], false)
    ).toEqual({ totalActions: 0, completed: 0, processing: 0 });
  });

  it('when not streaming counts all as completed and zero processing', () => {
    const session: SessionActivityEntryLike[] = [
      { id: 's1', created_at: '', story: [entry('1', 'step'), entry('2', 'step')] },
    ];
    expect(computeSessionStats(session, [], [], false)).toEqual({
      totalActions: 2,
      completed: 2,
      processing: 0,
    });
  });

  it('when streaming shows one processing and total minus one completed', () => {
    const session: SessionActivityEntryLike[] = [
      { id: 's1', created_at: '', story: [entry('1', 'step'), entry('2', 'step')] },
    ];
    expect(computeSessionStats(session, [], [], true)).toEqual({
      totalActions: 2,
      completed: 1,
      processing: 1,
    });
  });

  it('when streaming with single item completed is zero', () => {
    const session: SessionActivityEntryLike[] = [
      { id: 's1', created_at: '', story: [entry('1', 'step')] },
    ];
    expect(computeSessionStats(session, [], [], true)).toEqual({
      totalActions: 1,
      completed: 0,
      processing: 1,
    });
  });
});
