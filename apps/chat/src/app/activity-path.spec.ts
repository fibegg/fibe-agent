import { describe, it, expect } from 'vitest';
import { getActivityPath } from './activity-path';

describe('getActivityPath', () => {
  it('returns two-segment path when storyId differs from activityId', () => {
    expect(getActivityPath({ activityId: 'act-1', storyId: 'story-1' })).toBe('/activity/act-1/story-1');
  });

  it('returns one-segment path when storyId is omitted', () => {
    expect(getActivityPath({ activityId: 'act-1' })).toBe('/activity/act-1');
  });

  it('returns one-segment path when storyId equals activityId', () => {
    expect(getActivityPath({ activityId: 'same', storyId: 'same' })).toBe('/activity/same');
  });
});
