import {
  Brain,
  FileCode,
  Loader2,
  MessageSquare,
  Sparkles,
  Terminal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ACTIVITY_BLOCK_VARIANTS } from './ui-classes';

export const HIDDEN_ACTIVITY_TYPES = new Set<string>(['AskUserQuestion']);

export function filterVisibleStoryItems(entries: StoryEntry[]): StoryEntry[] {
  return entries.filter((e) => !HIDDEN_ACTIVITY_TYPES.has(e.type));
}

export type StoryEntry = {
  id: string;
  type: string;
  message: string;
  timestamp: string | Date;
  details?: string;
  command?: string;
  path?: string;
};

export function getActivityIcon(type: string): LucideIcon {
  switch (type) {
    case 'stream_start':
      return Sparkles;
    case 'reasoning_start':
    case 'reasoning_end':
      return Brain;
    case 'step':
      return Loader2;
    case 'file_created':
      return FileCode;
    case 'tool_call':
      return Terminal;
    case 'info':
      return MessageSquare;
    default:
      return MessageSquare;
  }
}

export function getActivityLabel(type: string): string {
  switch (type) {
    case 'stream_start':
      return 'Started';
    case 'reasoning_start':
    case 'reasoning_end':
      return '';
    case 'step':
      return 'Step';
    case 'file_created':
      return 'File';
    case 'tool_call':
      return 'Command';
    case 'info':
      return 'Info';
    default:
      return 'Activity';
  }
}

export function getBlockVariant(entry: StoryEntry): keyof typeof ACTIVITY_BLOCK_VARIANTS {
  if (entry.type === 'stream_start') return 'stream_start';
  if (entry.type === 'reasoning_start' || entry.type === 'reasoning_end') return 'reasoning';
  if (entry.type === 'step') return 'step';
  if (entry.type === 'tool_call') return 'tool_call';
  if (entry.type === 'file_created') return 'file_created';
  if (entry.type === 'task_complete') return 'task_complete';
  return 'default';
}

export function formatSessionDurationMs(ms: number): string {
  if (ms < 1000) return '0s';
  const sec = Math.floor(ms / 1000) % 60;
  const min = Math.floor(ms / 60_000) % 60;
  const h = Math.floor(ms / 3_600_000);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (min > 0) parts.push(`${min}m`);
  parts.push(`${sec}s`);
  return parts.join(' ');
}

export function toTimestampMs(ts: string | Date | undefined, fallback: string): number {
  if (!ts) return new Date(fallback).getTime();
  return typeof ts === 'string' ? new Date(ts).getTime() : (ts as Date).getTime();
}

export type SessionActivityEntryLike = { id: string; created_at: string; story?: StoryEntry[] };

export function buildFullStoryItems(
  sessionActivity: SessionActivityEntryLike[],
  pastActivityFromMessages: SessionActivityEntryLike[],
  storyItems: StoryEntry[]
): StoryEntry[] {
  const fromSession = sessionActivity.flatMap((a) => (a.story ?? []).map((s) => ({ ...s })));
  const fromPast = pastActivityFromMessages.flatMap((a) => (a.story ?? []).map((s) => ({ ...s })));
  const combined = filterVisibleStoryItems([...fromPast, ...fromSession, ...storyItems]);
  const seen = new Set<string>();
  return combined.filter((e) => {
    if (!e?.id || seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

export function computeSessionStats(
  sessionActivity: SessionActivityEntryLike[],
  pastActivityFromMessages: SessionActivityEntryLike[],
  storyItems: StoryEntry[],
  isStreaming: boolean
): { totalActions: number; completed: number; processing: number } {
  const fullStoryItems = buildFullStoryItems(sessionActivity, pastActivityFromMessages, storyItems);
  const totalActions = fullStoryItems.length;
  const completed = isStreaming ? Math.max(0, totalActions - 1) : totalActions;
  const processing = isStreaming ? 1 : 0;
  return { totalActions, completed, processing };
}
