export const API_PATHS = {
  AUTH_LOGIN: '/api/auth/login',
  MESSAGES: '/api/messages',
  MODEL_OPTIONS: '/api/model-options',
  REFRESH_MODEL_OPTIONS: '/api/model-options/refresh',
  UPLOADS: '/api/uploads',
  PLAYGROUNDS: '/api/playgrounds',
  PLAYGROUNDS_FILE: '/api/playgrounds/file',
  PLAYGROUNDS_STATS: '/api/playgrounds/stats',
  AGENT_FILES: '/api/agent-files',
  AGENT_FILES_FILE: '/api/agent-files/file',
  AGENT_FILES_STATS: '/api/agent-files/stats',
  ACTIVITIES: '/api/activities',
  ACTIVITIES_BY_ENTRY: '/api/activities/by-entry',
  INIT_STATUS: '/api/init-status',
  AGENT_SEND_MESSAGE: '/api/agent/send-message',
} as const;

export const API_PATH_UPLOADS_BY_FILENAME = (filename: string) =>
  `${API_PATHS.UPLOADS}/${encodeURIComponent(filename)}`;
