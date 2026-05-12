/**
 * Types shared between the local MCP service and its stdio child process.
 */

export interface LocalToolCallRequest {
  /** JSON-RPC id so the child can correlate responses. */
  requestId: string;
  tool: string;
  args: Record<string, unknown>;
  conversationId?: string;
}

export interface LocalToolCallResponse {
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export const LOCAL_MCP_SERVER_NAME = 'fibe-agent-local';

export const LOCAL_TOOL = {
  ASK_USER: 'ask_user',
  CONFIRM_ACTION: 'confirm_action',
  SHOW_IMAGE: 'show_image',
  SET_MODE: 'set_mode',
  GET_MODE: 'get_mode',
  NOTIFY: 'notify',
  SET_TITLE: 'set_title',
  GIT_STATUS: 'fibe_local_git_status',
  GIT_DIFF: 'fibe_local_git_diff',
  GIT_STAGE: 'fibe_local_git_stage',
  GIT_COMMIT: 'fibe_local_git_commit',
  GIT_BRANCH: 'fibe_local_git_branch',
  GIT_PUSH: 'fibe_local_git_push',
  GH_DRAFT_PR: 'fibe_local_gh_draft_pr',
} as const;

export type LocalToolName = (typeof LOCAL_TOOL)[keyof typeof LOCAL_TOOL];

/** Milliseconds the server will wait for an operator reply before timing out. */
export const DEFAULT_ASK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
