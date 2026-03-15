export type ThinkingStepStatus = 'pending' | 'processing' | 'complete';

export interface ThinkingStep {
  id: string;
  title: string;
  status: ThinkingStepStatus;
  details?: string;
  timestamp: Date;
}

export type ToolOrFileEventKind = 'file_created' | 'tool_call';

export interface ToolOrFileEvent {
  kind: ToolOrFileEventKind;
  name: string;
  path?: string;
  summary?: string;
  command?: string;
}

export type ThinkingActivityType =
  | 'reasoning_start'
  | 'reasoning_end'
  | 'step'
  | 'file_created'
  | 'tool_call'
  | 'stream_start'
  | 'info';

export interface ThinkingActivity {
  id: string;
  type: ThinkingActivityType;
  message: string;
  timestamp: Date;
  details?: string;
  command?: string;
  path?: string;
  debug?: Record<string, unknown>;
}
