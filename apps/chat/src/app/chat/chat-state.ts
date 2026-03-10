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

export const RESPONSE_TIMEOUT_MS = 600_000;
export const RECONNECT_INTERVAL_MS = 500;

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
}
