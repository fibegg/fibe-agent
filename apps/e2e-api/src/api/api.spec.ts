import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { waitForPortOpen, killPort } from '@nx/node/utils';
import { API_BASE_URL } from '../support/test-setup';

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

beforeAll(async () => {
  await waitForPortOpen(port, { host });
});

afterAll(async () => {
  await killPort(port);
});

describe('GET /api', () => {
  test('should return a message', async () => {
    const res = await fetch(`${API_BASE_URL}/api`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'Hello API' });
  });
});
