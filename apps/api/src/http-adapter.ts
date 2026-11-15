import { FastifyAdapter } from '@nestjs/platform-fastify';

/**
 * Clients reach the agent through the Host's reverse proxy, which connects
 * over the Docker network and forwards the client address in X-Forwarded-For.
 * Trusting forwarding only from loopback and private-network peers makes
 * `request.ip` the client the proxy saw, so per-client limits (the request
 * throttler and login attempts) count each client instead of treating every
 * client behind the proxy as one. A public peer's forwarding header is
 * ignored, and calls without one keep their own address. (Fastify ignores a
 * plain hop count, since it cannot tell whether the peer is the proxy.)
 */
export const TRUSTED_PROXIES = 'loopback, linklocal, uniquelocal';

export function createHttpAdapter(): FastifyAdapter {
  return new FastifyAdapter({ trustProxy: TRUSTED_PROXIES });
}
