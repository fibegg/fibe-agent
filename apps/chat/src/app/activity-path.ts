export function getActivityPath(payload: { activityId: string; storyId?: string }): string {
  const { activityId, storyId } = payload;
  if (storyId != null && storyId !== activityId) {
    return `/activity/${activityId}/${storyId}`;
  }
  return `/activity/${activityId}`;
}
