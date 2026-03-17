export const API_PATHS = {
  AUTH_LOGIN: '/api/auth/login',
  MESSAGES: '/api/messages',
  MODEL_OPTIONS: '/api/model-options',
  UPLOADS: '/api/uploads',
  PLAYGROUNDS: '/api/playgrounds',
  PLAYGROUNDS_FILE: '/api/playgrounds/file',
  ACTIVITIES: '/api/activities',
  ACTIVITIES_BY_ENTRY: '/api/activities/by-entry',
} as const;

export const API_PATH_UPLOADS_BY_FILENAME = (filename: string) =>
  `${API_PATHS.UPLOADS}/${encodeURIComponent(filename)}`;
