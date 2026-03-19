import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { waitForPortOpen, killPort } from '@nx/node/utils';
import axios from 'axios';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

beforeAll(async () => {
  await waitForPortOpen(port, { host });
});

afterAll(async () => {
  await killPort(port);
});

describe('GET /api', () => {
  test('should return a message', async () => {
    const res = await axios.get('/api');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ message: 'Hello API' });
  });
});
