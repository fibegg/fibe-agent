import { describe, test, expect } from 'bun:test';
import { createHttpAdapter } from './http-adapter';

describe('createHttpAdapter', () => {
  test('request.ip is the client the Host proxy forwarded; spoofed or untrusted forwarding is ignored', async () => {
    const fastify = createHttpAdapter().getInstance();
    fastify.get('/ip', async (request) => ({ ip: request.ip }));
    await fastify.ready();
    const ip = async (remoteAddress: string, forwarded?: string) =>
      (
        await fastify.inject({
          method: 'GET',
          url: '/ip',
          remoteAddress,
          headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
        })
      ).json().ip;

    // Proxied: the address the proxy appended.
    expect(await ip('172.18.0.2', '203.0.113.7')).toBe('203.0.113.7');
    // A client-supplied earlier entry is not trusted.
    expect(await ip('172.18.0.2', '198.51.100.9, 203.0.113.7')).toBe('203.0.113.7');
    // A public peer cannot claim another address.
    expect(await ip('203.0.113.50', '10.0.0.1')).toBe('203.0.113.50');
    // Direct and in-container calls keep their own address.
    expect(await ip('127.0.0.1')).toBe('127.0.0.1');
    await fastify.close();
  });
});
