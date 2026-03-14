import {
  Brain,
  FileCode,
  Loader2,
  MessageSquare,
  Search,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import { useRef, useEffect, useState } from 'react';
import { SidebarToggle } from './sidebar-toggle';
import {
  RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX,
  RIGHT_SIDEBAR_WIDTH_PX,
} from './layout-constants';
import { formatRelativeTime } from './format-relative-time';
import type { ThinkingStep, ToolOrFileEvent } from './chat/thinking-types';
import { TypingText } from './chat/typing-text';

const DEFAULT_MODEL_LABEL = 'Model (default)';

export type StoryEntry = {
  id: string;
  type: string;
  message: string;
  timestamp: string | Date;
  details?: string;
  command?: string;
  path?: string;
};

function getActivityIcon(type: string) {
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

function getActivityLabel(type: string): string {
  switch (type) {
    case 'stream_start':
      return 'Started';
    case 'reasoning_start':
    case 'reasoning_end':
      return 'Thinking';
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

interface AgentThinkingSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  isStreaming?: boolean;
  currentModel?: string;
  reasoningText?: string;
  streamingResponseText?: string;
  thinkingSteps?: ThinkingStep[];
  toolEvents?: ToolOrFileEvent[];
  storyItems?: StoryEntry[];
}

export function AgentThinkingSidebar({
  isCollapsed,
  onToggle,
  isStreaming = false,
  currentModel = '',
  reasoningText = '',
  streamingResponseText = '',
  thinkingSteps = [],
  toolEvents = [],
  storyItems = [],
}: AgentThinkingSidebarProps) {
  const thinkingScrollRef = useRef<HTMLDivElement>(null);
  const [activitySearchQuery, setActivitySearchQuery] = useState('');

  const displayThinkingText = reasoningText || streamingResponseText;

  const filteredStoryItems = activitySearchQuery.trim()
    ? storyItems.filter((entry) => {
        const q = activitySearchQuery.trim().toLowerCase();
        const message = (entry.message ?? '').toLowerCase();
        const details = (entry.details ?? '').toLowerCase();
        const command = (entry.command ?? '').toLowerCase();
        const path = (entry.path ?? '').toLowerCase();
        const label = getActivityLabel(entry.type).toLowerCase();
        return (
          message.includes(q) ||
          details.includes(q) ||
          command.includes(q) ||
          path.includes(q) ||
          label.includes(q)
        );
      })
    : storyItems;

  useEffect(() => {
    if (isStreaming && displayThinkingText) {
      thinkingScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isStreaming, displayThinkingText]);

  const modelLabel = currentModel.trim() || DEFAULT_MODEL_LABEL;

  return (
    <div
      className="relative h-full flex flex-col flex-shrink-0 bg-gradient-to-br from-background via-background to-purple-950/5 border-l border-violet-500/20 transition-all duration-300"
      style={{
        width: isCollapsed ? RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX : RIGHT_SIDEBAR_WIDTH_PX,
      }}
    >
      <SidebarToggle
        isCollapsed={isCollapsed}
        onClick={onToggle}
        side="right"
        ariaLabel={
          isCollapsed ? 'Expand thinking panel' : 'Collapse thinking panel'
        }
      />

      <div className="p-4 border-b border-violet-500/20 shrink-0">
        {!isCollapsed ? (
          <>
            <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                <div className="relative shrink-0">
                  <Brain className="size-5 text-violet-400" />
                  <Sparkles className="size-3 text-violet-300 absolute -top-1 -right-1 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm truncate">Agent Thinking</h2>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {isStreaming ? 'Processing' : 'Idle'}
                  </p>
                </div>
              </div>
              <span
                className="shrink-0 text-xs bg-card/50 backdrop-blur-sm border border-border/50 h-auto py-1 px-2 rounded-md truncate max-w-[120px]"
                title={modelLabel}
              >
                {modelLabel}
              </span>
            </div>
            <div className="relative h-8 mt-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={activitySearchQuery}
                onChange={(e) => setActivitySearchQuery(e.target.value)}
                placeholder="Search activity..."
                className="w-full h-8 pl-8 pr-8 text-xs bg-background/50 border border-violet-500/30 rounded-md focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 text-foreground placeholder:text-muted-foreground"
                aria-label="Search activity"
              />
              {activitySearchQuery ? (
                <button
                  type="button"
                  onClick={() => setActivitySearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="relative mx-auto">
            <Brain className="size-5 text-violet-400" />
            <Loader2
              className={`size-3 text-violet-300 absolute -top-1 -right-1 ${
                isStreaming ? 'animate-spin' : ''
              }`}
            />
          </div>
        )}
      </div>

      {!isCollapsed && (
        <div className="flex-1 min-h-0 overflow-auto p-4 flex flex-col gap-3">
          <div className="flex-1 min-h-0 max-h-[360px] overflow-y-auto rounded-lg border border-violet-500/20 bg-violet-500/5 flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-violet-500/20 shrink-0">
              <h3 className="text-[10px] font-semibold text-violet-300 uppercase tracking-wide">
                Online activity
              </h3>
              {isStreaming && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/20 text-[9px] font-medium text-violet-400">
                  <span className="size-1.5 rounded-full bg-violet-400 animate-pulse" aria-hidden />
                  Live
                </span>
              )}
            </div>
            <ul className="list-none p-0 m-0 flex-1 min-h-0 overflow-y-auto border-l-2 border-violet-500/20 ml-3 pl-3">
              {filteredStoryItems.length === 0 && storyItems.length === 0 && !displayThinkingText && !isStreaming && (
                <li className="py-3 text-xs text-muted-foreground">
                  Activity will appear here when the agent responds.
                </li>
              )}
              {filteredStoryItems.length === 0 && storyItems.length > 0 && activitySearchQuery.trim() && (
                <li className="py-3 text-xs text-muted-foreground">
                  No activity matches &quot;{activitySearchQuery.trim()}&quot;.
                </li>
              )}
              {filteredStoryItems.map((entry) => {
                const Icon = getActivityIcon(entry.type);
                const label = getActivityLabel(entry.type);
                const isCommandBlock = entry.type === 'tool_call' && entry.command;
                const isFileBlock = entry.type === 'file_created' && (entry.path || entry.details);
                const isThinkingBlock =
                  entry.type === 'reasoning_start' && (entry.details ?? '').trim().length > 0;
                return (
                  <li
                    key={entry.id}
                    className="relative pl-5 pr-2 py-2.5 flex items-start gap-2 before:content-[''] before:absolute before:left-[-11px] before:top-3.5 before:size-2 before:rounded-full before:bg-violet-400 before:border-2 before:border-background before:z-[1]"
                  >
                    <Icon
                      className={`size-4 shrink-0 mt-0.5 -ml-4 ${
                        entry.type === 'file_created'
                          ? 'text-green-400'
                          : entry.type === 'tool_call'
                            ? 'text-violet-400'
                            : 'text-violet-300'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-[10px] font-medium text-violet-300 uppercase tracking-wide">
                          {label}
                        </p>
                        <span className="text-[9px] text-muted-foreground shrink-0">
                          {formatRelativeTime(entry.timestamp)}
                        </span>
                      </div>
                      {isThinkingBlock ? (
                        <div className="mt-1.5 rounded-md bg-violet-950/40 border border-violet-500/20 px-2.5 py-2 max-h-32 overflow-y-auto">
                          <p className="text-[11px] text-foreground/90 whitespace-pre-wrap font-mono leading-relaxed break-words">
                            {entry.details}
                          </p>
                        </div>
                      ) : isCommandBlock ? (
                        <div className="mt-1.5 rounded-md bg-zinc-900/90 border border-violet-500/20 px-2.5 py-2 font-mono text-[11px] text-green-300/95 overflow-x-auto">
                          <span className="text-violet-400/80 select-none">$ </span>
                          <TypingText
                            text={entry.command ?? ''}
                            charMs={20}
                            showCursor={isStreaming}
                            skipAnimation={!isStreaming}
                          />
                        </div>
                      ) : isFileBlock ? (
                        <div className="mt-1.5 rounded-md bg-green-950/30 border border-green-500/20 px-2.5 py-1.5 flex items-center gap-2">
                          <FileCode className="size-3.5 text-green-400 shrink-0" />
                          <span className="text-[11px] text-foreground/90 font-mono truncate" title={entry.path ?? entry.details}>
                            {entry.path ?? entry.details}
                          </span>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-foreground/90 mt-0.5 break-words">{entry.message}</p>
                          {entry.details && entry.type !== 'reasoning_start' && (
                            <p className="text-[10px] text-muted-foreground mt-1 truncate" title={entry.details}>
                              {entry.details}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
              {(displayThinkingText || isStreaming) && (
                <li className="relative pl-5 pr-2 py-2.5 flex flex-col gap-1.5 before:content-[''] before:absolute before:left-[-11px] before:top-3.5 before:size-2 before:rounded-full before:bg-violet-400 before:border-2 before:border-background before:z-[1] before:animate-pulse">
                  <p className="text-[10px] font-semibold text-violet-300 uppercase tracking-wide">
                    {reasoningText ? 'Reasoning' : 'Response'}
                  </p>
                  <div className="text-xs text-foreground/90 whitespace-pre-wrap font-mono leading-relaxed break-words">
                    {displayThinkingText || (isStreaming ? '…' : '')}
                    <span ref={thinkingScrollRef} className="inline-block min-h-0" aria-hidden />
                  </div>
                </li>
              )}
            </ul>
          </div>

          {toolEvents.length > 0 && (
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 overflow-hidden shrink-0">
              <h3 className="text-xs font-semibold px-3 py-2 text-violet-300 border-b border-violet-500/20">
                Created files & tools
              </h3>
              <div className="divide-y divide-violet-500/10 max-h-40 overflow-y-auto">
                {toolEvents.map((event, i) => (
                  <div
                    key={i}
                    className="p-3 flex items-start gap-3 rounded-none border-0 border-b border-violet-500/10 last:border-b-0"
                  >
                    {event.kind === 'file_created' ? (
                      <FileCode className="size-4 text-green-400 shrink-0 mt-0.5" />
                    ) : (
                      <Terminal className="size-4 text-violet-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{event.name}</p>
                      {event.path && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5" title={event.path}>
                          {event.path}
                        </p>
                      )}
                      {event.summary && !event.path && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {event.summary}
                        </p>
                      )}
                      <span
                        className={`inline-block mt-1.5 px-2 py-0.5 rounded text-[10px] font-medium ${
                          event.kind === 'file_created'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-violet-500/20 text-violet-400'
                        }`}
                      >
                        {event.kind === 'file_created' ? 'Created' : 'Ran'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isCollapsed && (
        <div className="flex-1 flex flex-col items-center justify-start pt-8 gap-4">
          <div className="relative">
            <Brain className="size-6 text-violet-400" />
            <Loader2
              className={`size-3 text-violet-300 absolute -bottom-1 -right-1 ${
                isStreaming ? 'animate-spin' : ''
              }`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
