import type { StoredActivityEntry } from '@shared/types';

export type { StoredStoryEntry, StoredActivityEntry } from '@shared/types';
export { WS_CLOSE } from '@shared/ws-constants';

export const CHAT_STATES = {
  INITIALIZING: 'INITIALIZING',
  AGENT_OFFLINE: 'AGENT_OFFLINE',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  AUTH_PENDING: 'AUTH_PENDING',
  AUTHENTICATED: 'AUTHENTICATED',
  AWAITING_RESPONSE: 'AWAITING_RESPONSE',
  LOGGING_OUT: 'LOGGING_OUT',
  ERROR: 'ERROR',
} as const;

export type ChatState = (typeof CHAT_STATES)[keyof typeof CHAT_STATES];

export const STATE_LABELS: Record<ChatState, string> = {
  [CHAT_STATES.INITIALIZING]: 'Connecting...',
  [CHAT_STATES.AGENT_OFFLINE]: 'Agent offline',
  [CHAT_STATES.UNAUTHENTICATED]: 'Authentication required',
  [CHAT_STATES.AUTH_PENDING]: 'Authentication in progress...',
  [CHAT_STATES.AUTHENTICATED]: 'Ready',
  [CHAT_STATES.AWAITING_RESPONSE]: 'Working...',
  [CHAT_STATES.LOGGING_OUT]: 'Logging out...',
  [CHAT_STATES.ERROR]: 'Error occurred',
};

export const CHAT_INPUT_PLACEHOLDER = {
  AUTH_REQUIRED: 'Complete authentication to start chatting...',
  READY: 'Talk to fibe...',
  WORKING: 'Queue a message for the agent...',
} as const;

export function getChatInputPlaceholder(state: ChatState): string {
  if (state === CHAT_STATES.AWAITING_RESPONSE) return CHAT_INPUT_PLACEHOLDER.WORKING;
  if (state === CHAT_STATES.AUTHENTICATED) return CHAT_INPUT_PLACEHOLDER.READY;
  return CHAT_INPUT_PLACEHOLDER.AUTH_REQUIRED;
}

export const RESPONSE_TIMEOUT_MS = 600_000;
export const RECONNECT_INTERVAL_MS = 500;



export const ERROR_MESSAGES_NO_RETRY: ReadonlySet<string> = new Set([
  'Another session is already active',
  'Your session was taken over by another client',
]);

export const ERROR_MESSAGE_MAX_DISPLAY_LENGTH = 280;

export function truncateError(message: string | null, maxLen = ERROR_MESSAGE_MAX_DISPLAY_LENGTH): string {
  if (!message) return '';
  if (message.length <= maxLen) return message;
  return message.slice(0, maxLen).trim() + '...';
}

export function isRetryableError(errorMessage: string | null): boolean {
  return !!errorMessage && !ERROR_MESSAGES_NO_RETRY.has(errorMessage);
}

export interface ServerMessage {
  type: string;
  status?: string;
  isProcessing?: boolean;
  url?: string;
  code?: string;
  message?: string;
  role?: string;
  body?: string;
  created_at?: string;
  text?: string;
  model?: string;
  imageUrls?: string[];
  id?: string;
  title?: string;
  mode?: string;
  details?: string;
  timestamp?: string;
  name?: string;
  path?: string;
  summary?: string;
  kind?: 'file_created' | 'tool_call';
  command?: string;
  activity?: StoredActivityEntry[];
  entry?: StoredActivityEntry;
  count?: number;
  usage?: { inputTokens: number; outputTokens: number };
}


