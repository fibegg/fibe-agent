import type React from 'react';
import {
  parseThinkingSegmentsWithAgreement,
  SUSPICIOUS_TOOLTIP,
  AGREEMENT_TOOLTIP,
  UNCERTAINTY_TOOLTIP,
  QUESTION_TOOLTIP,
} from './thinking-failure-patterns';
import { getActivityLabel } from './agent-thinking-utils';
import type { StoryEntry } from './agent-thinking-utils';

export const SINGLE_ROW_TYPES = new Set<string>(['stream_start', 'step', 'tool_call', 'file_created']);

export const ACTIVITY_TYPE_FILTERS = [
  'reasoning',
  'stream_start',
  'step',
  'tool_call',
  'file_created',
  'task_complete',
] as const;

export function getTypeFilterLabel(key: string | null): string {
  if (key === 'reasoning') return 'Reasoning';
  if (key === 'task_complete') return 'Complete';
  return (getActivityLabel(key ?? '') || key) ?? '';
}

export const BADGE_ACTIVE_STYLES: Record<string, string> = {
  reasoning: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  stream_start: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  step: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40',
  tool_call: 'bg-violet-400/20 text-violet-300 border-amber-500/40',
  file_created: 'bg-green-500/20 text-green-300 border-green-500/40',
  task_complete: 'bg-green-500/20 text-green-300 border-green-500/40',
};

export const BADGE_INACTIVE_STYLES: Record<string, string> = {
  reasoning: 'hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/30',
  stream_start: 'hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/30',
  step: 'hover:bg-zinc-500/10 hover:text-zinc-400 hover:border-zinc-500/30',
  tool_call: 'hover:bg-violet-400/10 hover:text-amber-400 hover:border-amber-500/30',
  file_created: 'hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/30',
  task_complete: 'hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/30',
};

export function commandLabel(entry: StoryEntry): string {
  if (entry.command) return entry.command;
  const msg = entry.message?.trim();
  if (msg && msg !== '{}') return msg.replace(/^Ran\s+/i, '');
  return getActivityLabel(entry.type) || entry.type;
}

export function getCopyableStoryText(story: StoryEntry): string {
  const label = getActivityLabel(story.type) ?? story.type;
  const time = story.timestamp ? new Date(story.timestamp).toLocaleString() : '';
  const parts = [`${label}${time ? ` · ${time}` : ''}`];
  if (story.message?.trim()) parts.push(story.message.trim());
  if (story.details?.trim() && String(story.details).trim() !== '{}') parts.push(story.details.trim());
  if (story.type === 'tool_call' && story.command) parts.push(`$ ${story.command}`);
  if (story.type === 'file_created' && story.path) parts.push(story.path);
  return parts.join('\n\n');
}

export function getCopyableActivityText(stories: StoryEntry[]): string {
  return stories.map(getCopyableStoryText).join('\n\n---\n\n');
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const HIGHLIGHT_MARK_CLASS =
  'bg-amber-400/40 text-amber-950 dark:bg-amber-400/50 dark:text-violet-100 rounded px-0.5';
const SUSPICIOUS_SEGMENT_CLASS =
  'bg-violet-400/25 text-violet-200 border-b border-amber-500/50 rounded-sm px-0.5';
const AGREEMENT_SEGMENT_CLASS =
  'bg-emerald-500/25 text-emerald-200 border-b border-emerald-500/50 rounded-sm px-0.5';
const UNCERTAINTY_SEGMENT_CLASS =
  'bg-amber-400/20 text-violet-100 border-b border-amber-400/40 rounded-sm px-0.5';
const QUESTION_SEGMENT_CLASS =
  'bg-sky-500/25 text-sky-200 border-b border-sky-500/50 rounded-sm px-0.5';

export function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = escapeRegex(query.trim());
  const re = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(re);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className={HIGHLIGHT_MARK_CLASS}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function reasoningBodyWithHighlights(details: string, query: string): React.ReactNode {
  const segments = parseThinkingSegmentsWithAgreement(details);
  if (segments.length === 0) return details;
  return (
    <>
      {segments.map((seg, i) => {
        const inner = highlightText(seg.text, query);
        if (seg.kind === 'suspicious')
          return (
            <mark key={i} className={SUSPICIOUS_SEGMENT_CLASS} title={SUSPICIOUS_TOOLTIP}>
              {inner}
            </mark>
          );
        if (seg.kind === 'agreement')
          return (
            <mark key={i} className={AGREEMENT_SEGMENT_CLASS} title={AGREEMENT_TOOLTIP}>
              {inner}
            </mark>
          );
        if (seg.kind === 'uncertainty')
          return (
            <mark key={i} className={UNCERTAINTY_SEGMENT_CLASS} title={UNCERTAINTY_TOOLTIP}>
              {inner}
            </mark>
          );
        if (seg.kind === 'question')
          return (
            <mark key={i} className={QUESTION_SEGMENT_CLASS} title={QUESTION_TOOLTIP}>
              {inner}
            </mark>
          );
        return <span key={i}>{inner}</span>;
      })}
    </>
  );
}
