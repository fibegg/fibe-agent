import { memo, useRef, useState, useCallback } from 'react';
import { Brain, Loader2, Sparkles } from 'lucide-react';
import { createPortal } from 'react-dom';
import { CountUpNumber } from './count-up-number';
import type { StoryEntry } from './agent-thinking-utils';

interface SessionStats {
  totalActions: number;
  completed: number;
  processing: number;
  sessionTimeMs: number;
}

interface BrainClasses {
  brain: string;
  accent: string;
}

const STAT_TOOLTIPS = {
  total: 'Total actions',
  completed: 'Completed',
  processing: 'Processing',
} as const;

const STAT_TOOLTIP_POPOVER_CLASS =
  'pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 rounded px-2 py-1 text-[10px] font-medium bg-popover text-popover-foreground border border-border shadow-md opacity-0 transition-opacity duration-150 whitespace-nowrap group-hover/stat:opacity-100';

interface SidebarStatsBarProps {
  sessionStats: SessionStats;
  brainClasses: BrainClasses;
  isStreaming: boolean;
  downloadAnimating: boolean;
  onRunCopy: () => void;
  sessionTokenUsage?: { inputTokens: number; outputTokens: number } | null;
  fullStoryItems: StoryEntry[];
}

export const SidebarStatsBar = memo(function SidebarStatsBar({
  sessionStats,
  brainClasses,
  isStreaming,
  downloadAnimating,
  onRunCopy,
  sessionTokenUsage,
}: SidebarStatsBarProps) {
  const brainButtonRef = useRef<HTMLDivElement>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [copyTooltipAnchor, setCopyTooltipAnchor] = useState<{ centerX: number; bottom: number } | null>(null);

  const handleCopy = useCallback(() => {
    onRunCopy();
    const rect = brainButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setCopyTooltipAnchor({ centerX: rect.left + rect.width / 2, bottom: rect.bottom });
    }
    setCopiedToClipboard(true);
    setTimeout(() => {
      setCopiedToClipboard(false);
      setCopyTooltipAnchor(null);
    }, 2500);
  }, [onRunCopy]);

  const isEmpty =
    sessionStats.totalActions === 0 &&
    sessionStats.completed === 0 &&
    sessionStats.processing === 0;

  return (
    <div className="flex items-center gap-2 overflow-visible">
      <div ref={brainButtonRef} className="relative shrink-0 flex items-center justify-center" style={{ display: 'none' }}>
        <button
          type="button"
          onClick={handleCopy}
          className="relative rounded-md hover:bg-muted/50 transition-colors cursor-pointer border-0 bg-transparent p-0"
          aria-label="Activity"
          disabled={downloadAnimating}
        >
          {downloadAnimating ? (
            <span className="inline-flex items-center justify-center text-violet-400" aria-hidden>
              <Brain className="size-8 brain-download-anim" />
            </span>
          ) : (
            <>
              <Brain className={`size-8 ${brainClasses.brain} transition-colors`} />
              {isStreaming ? (
                <Loader2
                  className={`size-5 ${brainClasses.accent} absolute -top-0.5 -right-0.5 animate-spin transition-colors`}
                  aria-hidden
                />
              ) : (
                <Sparkles
                  className={`size-5 ${brainClasses.accent} absolute -top-0.5 -right-0.5 animate-pulse transition-colors`}
                  aria-hidden
                />
              )}
            </>
          )}
        </button>
      </div>
      {copiedToClipboard &&
        copyTooltipAnchor &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            className="pointer-events-none fixed z-[9999] rounded px-2 py-1 text-[10px] font-medium bg-popover text-popover-foreground border border-border shadow-lg whitespace-nowrap"
            role="status"
            style={{
              left: copyTooltipAnchor.centerX,
              top: copyTooltipAnchor.bottom + 8,
              transform: 'translate(-50%, 0)',
            }}
          >
            Copied to clipboard
          </span>,
          document.body
        )}
      {isEmpty ? (
        <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground italic max-w-[200px] leading-none flex items-center">
          These are not the droids you deepseek.
        </p>
      ) : (
        <p className="px-2 py-1.5 text-xs font-medium tabular-nums leading-none flex items-center gap-0.5 flex-wrap">
          <span
            key={`total-${sessionStats.totalActions}`}
            className="group/stat relative inline-block cursor-help rounded px-0.5 py-0.5 -my-0.5 -mx-0.5"
            title={STAT_TOOLTIPS.total}
          >
            <span className="text-foreground stat-tick"><CountUpNumber value={sessionStats.totalActions} format="raw" /></span>
            <span className={STAT_TOOLTIP_POPOVER_CLASS} role="tooltip">
              {STAT_TOOLTIPS.total}
            </span>
          </span>
          <span className="text-muted-foreground/70">/</span>
          <span
            key={`completed-${sessionStats.completed}`}
            className="group/stat relative inline-block cursor-help rounded px-0.5 py-0.5 -my-0.5 -mx-0.5"
            title={STAT_TOOLTIPS.completed}
          >
            <span className="text-emerald-400 stat-tick"><CountUpNumber value={sessionStats.completed} format="raw" /></span>
            <span className={STAT_TOOLTIP_POPOVER_CLASS} role="tooltip">
              {STAT_TOOLTIPS.completed}
            </span>
          </span>
          <span className="text-muted-foreground/70">/</span>
          <span
            key={`processing-${sessionStats.processing}`}
            className="group/stat relative inline-block cursor-help rounded px-0.5 py-0.5 -my-0.5 -mx-0.5"
            title={STAT_TOOLTIPS.processing}
          >
            <span className="text-cyan-400 stat-tick"><CountUpNumber value={sessionStats.processing} format="raw" /></span>
            <span className={STAT_TOOLTIP_POPOVER_CLASS} role="tooltip">
              {STAT_TOOLTIPS.processing}
            </span>
          </span>
          {sessionTokenUsage && (
            <>
              <span className="text-muted-foreground/70">·</span>
              <span
                className="text-violet-300/90"
                title="Token usage (input / output)"
              >
                <CountUpNumber value={sessionTokenUsage.inputTokens} format="compact" /> in / <CountUpNumber value={sessionTokenUsage.outputTokens} format="compact" /> out
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
});
