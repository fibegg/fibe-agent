import {
  Brain,
  CheckCircle2,
  Clock,
  Loader2,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { SidebarToggle } from './sidebar-toggle';
import {
  RIGHT_SIDEBAR_COLLAPSED_WIDTH_PX,
  RIGHT_SIDEBAR_WIDTH_PX,
} from './layout-constants';

interface ThinkingStep {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'complete';
  details?: string;
  timestamp: Date;
}

interface AgentThinkingSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  isStreaming?: boolean;
}

const MOCK_STEPS: ThinkingStep[] = [
  {
    id: '1',
    title: 'Analyzing user query',
    status: 'complete',
    details: 'Parsed intent and extracted key requirements',
    timestamp: new Date(Date.now() - 5000),
  },
  {
    id: '2',
    title: 'Searching knowledge base',
    status: 'complete',
    details: 'Found 15 relevant code patterns',
    timestamp: new Date(Date.now() - 3000),
  },
  {
    id: '3',
    title: 'Generating response',
    status: 'processing',
    details: 'Synthesizing optimal solution...',
    timestamp: new Date(),
  },
  {
    id: '4',
    title: 'Validating output',
    status: 'pending',
    timestamp: new Date(),
  },
];

function getStatusIcon(status: ThinkingStep['status']) {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="size-4 text-green-400" />;
    case 'processing':
      return <Loader2 className="size-4 text-violet-400 animate-spin" />;
    case 'pending':
      return <Clock className="size-4 text-muted-foreground" />;
  }
}

function getStatusColor(status: ThinkingStep['status']) {
  switch (status) {
    case 'complete':
      return 'border-green-500/30 bg-green-500/5';
    case 'processing':
      return 'border-violet-500/50 bg-violet-500/10 shadow-lg shadow-violet-500/20';
    case 'pending':
      return 'border-border/50 bg-muted/30';
  }
}

function formatRelativeTime(date: Date): string {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return 'now';
  if (sec < 120) return '1s ago';
  if (sec < 300) return `${Math.floor(sec / 60)}s ago`;
  return 'now';
}

export function AgentThinkingSidebar({
  isCollapsed,
  onToggle,
  isStreaming = false,
}: AgentThinkingSidebarProps) {
  const [thinkingSteps] = useState<ThinkingStep[]>(MOCK_STEPS);
  const [searchQuery, setSearchQuery] = useState('');

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
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Brain className="size-5 text-violet-400" />
                  <Sparkles className="size-3 text-violet-300 absolute -top-1 -right-1 animate-pulse" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">Agent Thinking</h2>
                  <p className="text-[10px] text-muted-foreground">
                    {isStreaming ? 'Processing' : 'Idle'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-xs bg-card/50 backdrop-blur-sm border border-border/50 h-auto py-1 px-2 rounded-md"
              >
                Model (default)
              </button>
            </div>
            <div className="relative h-8">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search thinking steps..."
                className="h-8 w-full pl-8 pr-8 text-xs rounded-md bg-input-background dark:bg-input/30 border border-border focus:border-violet-500 dark:focus:border-primary text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:focus:ring-primary/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
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
        <div className="flex-1 min-h-0 overflow-auto p-4">
          <div className="space-y-3">
            {thinkingSteps.map((step, index) => (
              <div
                key={step.id}
                className={`p-3 rounded-lg border transition-all duration-300 ${getStatusColor(
                  step.status
                )}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{getStatusIcon(step.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-medium">{step.title}</h3>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(step.timestamp)}
                      </span>
                    </div>
                    {step.details && (
                      <p className="text-xs text-muted-foreground">
                        {step.details}
                      </p>
                    )}
                  </div>
                </div>
                {step.status === 'processing' && (
                  <div className="mt-2 h-1 bg-violet-500/20 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full animate-pulse w-3/4" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-6 p-3 rounded-lg bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/20">
            <h3 className="text-xs font-semibold mb-2 text-violet-300">
              Processing Stats
            </h3>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Tokens analyzed:</span>
                <span className="text-foreground font-medium">1,247</span>
              </div>
              <div className="flex justify-between">
                <span>Response time:</span>
                <span className="text-foreground font-medium">2.3s</span>
              </div>
              <div className="flex justify-between">
                <span>Confidence:</span>
                <span className="text-green-400 font-medium">94%</span>
              </div>
            </div>
          </div>
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
