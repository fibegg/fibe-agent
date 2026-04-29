export const WS_ACTION = {
  CHECK_AUTH_STATUS: 'check_auth_status',
  INITIATE_AUTH: 'initiate_auth',
  SUBMIT_AUTH_CODE: 'submit_auth_code',
  CANCEL_AUTH: 'cancel_auth',
  REAUTHENTICATE: 'reauthenticate',
  LOGOUT: 'logout',
  SEND_CHAT_MESSAGE: 'send_chat_message',
  QUEUE_MESSAGE: 'queue_message',
  SUBMIT_STORY: 'submit_story',
  GET_MODEL: 'get_model',
  SET_MODEL: 'set_model',
  INTERRUPT_AGENT: 'interrupt_agent',
  SET_AGENT_MODE: 'set_agent_mode',
  /** Reply to an ask_user_prompt from the agent. */
  ANSWER_USER_QUESTION: 'answer_user_question',
  /** Reply to a confirm_action_prompt from the agent (yes/no). */
  CONFIRM_ACTION_RESPONSE: 'confirm_action_response',
} as const;

export const WS_EVENT = {
  AUTH_STATUS: 'auth_status',
  AUTH_URL_GENERATED: 'auth_url_generated',
  AUTH_DEVICE_CODE: 'auth_device_code',
  AUTH_MANUAL_TOKEN: 'auth_manual_token',
  AUTH_SUCCESS: 'auth_success',
  LOGOUT_OUTPUT: 'logout_output',
  LOGOUT_SUCCESS: 'logout_success',
  ERROR: 'error',
  MESSAGE: 'message',
  STREAM_START: 'stream_start',
  STREAM_CHUNK: 'stream_chunk',
  STREAM_END: 'stream_end',
  MODEL_UPDATED: 'model_updated',
  REASONING_START: 'reasoning_start',
  REASONING_CHUNK: 'reasoning_chunk',
  REASONING_END: 'reasoning_end',
  THINKING_STEP: 'thinking_step',
  TOOL_CALL: 'tool_call',
  FILE_CREATED: 'file_created',
  ACTIVITY_SNAPSHOT: 'activity_snapshot',
  ACTIVITY_APPENDED: 'activity_appended',
  ACTIVITY_UPDATED: 'activity_updated',
  PLAYGROUND_CHANGED: 'playground_changed',
  QUEUE_UPDATED: 'queue_updated',
  AGENT_MODE_UPDATED: 'agent_mode_updated',
  /** Agent is asking the operator a question — display an inline input card. */
  ASK_USER_PROMPT: 'ask_user_prompt',
  /** Agent needs a yes/no confirmation — display confirm card. */
  CONFIRM_ACTION_PROMPT: 'confirm_action_prompt',
  /** Agent is showing an image inline in the chat thread. */
  SHOW_IMAGE: 'show_image',
  /** Agent sends a non-blocking notification/toast. */
  NOTIFY: 'notify',
  /** Agent requests an update to the activity title in the sidebar. */
  SET_TITLE: 'set_title',
} as const;

export const AUTH_STATUS = {
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
} as const;

export const ERROR_CODE = {
  NEED_AUTH: 'NEED_AUTH',
  AGENT_BUSY: 'AGENT_BUSY',
  BLOCKED: 'BLOCKED',
} as const;

export const WS_CLOSE = {
  ANOTHER_SESSION_ACTIVE: 4000,
  UNAUTHORIZED: 4001,
  SESSION_TAKEN_OVER: 4002,
} as const;
