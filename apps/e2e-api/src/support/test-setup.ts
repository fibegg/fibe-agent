const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ?? '3000';

export const API_BASE_URL = `http://${host}:${port}`;
