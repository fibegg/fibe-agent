import type { StoredActivityEntry } from '@shared/types';
import { isProviderAuthFailureMessage } from '@shared/provider-auth-errors';
import { translate, type TranslationKey } from '../i18n';

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

export const STATE_LABEL_KEYS: Record<ChatState, TranslationKey> = {
  [CHAT_STATES.INITIALIZING]: 'chat.state.connecting',
  [CHAT_STATES.AGENT_OFFLINE]: 'chat.state.agentOffline',
  [CHAT_STATES.UNAUTHENTICATED]: 'chat.state.authRequired',
  [CHAT_STATES.AUTH_PENDING]: 'chat.state.authPending',
  [CHAT_STATES.AUTHENTICATED]: 'chat.state.ready',
  [CHAT_STATES.AWAITING_RESPONSE]: 'chat.state.working',
  [CHAT_STATES.LOGGING_OUT]: 'chat.state.loggingOut',
  [CHAT_STATES.ERROR]: 'chat.state.error',
};

export const CHAT_INPUT_PLACEHOLDER = {
  AUTH_REQUIRED: 'Complete authentication to start chatting...',
  READY: 'Talk to fibe...',
  WORKING: 'Queue a message for the agent...',
} as const;

export function getChatInputPlaceholder(state: ChatState): string {
  if (state === CHAT_STATES.AWAITING_RESPONSE) return translate('chat.input.working');
  if (state === CHAT_STATES.AUTHENTICATED) return translate('chat.input.ready');
  return translate('chat.input.authRequired');
}

export function getChatInputPlaceholderWithT(state: ChatState, t: (key: TranslationKey) => string): string {
  if (state === CHAT_STATES.AWAITING_RESPONSE) return t('chat.input.working');
  if (state === CHAT_STATES.AUTHENTICATED) return t('chat.input.ready');
  return t('chat.input.authRequired');
}

export function getChatStateLabel(state: ChatState, t: (key: TranslationKey) => string): string {
  return t(STATE_LABEL_KEYS[state] ?? 'chat.state.error');
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
  if (isProviderAuthFailureMessage(errorMessage)) return false;
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
  effort?: string;
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
  // local MCP tool events
  questionId?: string;
  question?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  base64?: string;
  mimeType?: string;
  caption?: string;
  level?: string;
  /** Included in the conversation_reset event payload. */
  resetAt?: string;
}
