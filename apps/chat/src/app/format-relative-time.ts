export function formatRelativeTime(timestamp: string | Date, now = Date.now()): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const sec = Math.floor((now - date.getTime()) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
