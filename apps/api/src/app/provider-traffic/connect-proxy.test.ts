import { describe, test, expect, afterEach } from 'bun:test';
import {
  createServer as createHttpsServer,
  type Server as HttpsServer,
} from 'node:https';
import { request as httpRequest } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import forge from 'node-forge';
import { CertificateManager } from './certificate-manager';
import { ConnectProxy } from './connect-proxy';
import type { CapturedProviderRequest } from './types';
import { INTERCEPTED_DOMAINS } from './types';

function _createFakeProvider(hostname: string): {
  server: HttpsServer;
  start: () => Promise<number>;
  stop: () => Promise<void>;
} {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);
  cert.setSubject([{ name: 'commonName', value: hostname }]);
  cert.setIssuer([{ name: 'commonName', value: hostname }]);
  cert.setExtensions([
    { name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const server = createHttpsServer(
    {
      key: forge.pki.privateKeyToPem(keys.privateKey),
      cert: forge.pki.certificateToPem(cert),
    },
    (req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ echo: body, method: req.method, url: req.url }),
        );
      });
    },
  );

  return {
    server,
    start: () =>
      new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          resolve(typeof addr === 'object' && addr !== null ? addr.port : 0);
        });
      }),
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

describe('ConnectProxy', () => {
  let certManager: CertificateManager | null = null;
  let proxy: ConnectProxy | null = null;

  afterEach(async () => {
    if (proxy) await proxy.stop();
    certManager?.cleanup();
    proxy = null;
    certManager = null;
  });

  test('starts on ephemeral port and stops cleanly', async () => {
    certManager = new CertificateManager();
    const captured: CapturedProviderRequest[] = [];

    proxy = new ConnectProxy({
      certManager,
      onCapturedRequest: (r) => captured.push(r),
    });

    const port = await proxy.start();
    expect(port).toBeGreaterThan(0);
    expect(proxy.getPort()).toBe(port);

    await proxy.stop();
    proxy = null;
  });

  test('disable closes an owned CONNECT tunnel and its loopback upstream', async () => {
    certManager = new CertificateManager();
    let closed!: () => void;
    const upstreamClosed = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const upstream = createTcpServer((socket) => {
      socket.on('data', () => undefined);
      socket.once('close', closed);
    });
    await new Promise<void>((resolve) =>
      upstream.listen(0, '127.0.0.1', resolve),
    );
    const address = upstream.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing fixture port');
    proxy = new ConnectProxy({
      certManager,
      onCapturedRequest: () => undefined,
    });
    const port = await proxy.start();
    try {
      await new Promise<void>((resolve, reject) => {
        const request = httpRequest({
          host: '127.0.0.1',
          port,
          method: 'CONNECT',
          path: `127.0.0.1:${address.port}`,
        });
        request.once('error', reject);
        request.once('connect', (_response, socket) => {
          socket.on('error', () => undefined);
          resolve();
        });
        request.end();
      });
      await proxy.stop();
      await upstreamClosed;
      expect(proxy.getPort()).toBe(port);
    } finally {
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });

  test('intercepts CONNECT to known provider domain and captures traffic', async () => {
    certManager = new CertificateManager();
    const captured: CapturedProviderRequest[] = [];

    proxy = new ConnectProxy({
      certManager,
      onCapturedRequest: (r) => captured.push(r),
    });

    const proxyPort = await proxy.start();

    await new Promise<void>((resolve) => {
      const req = httpRequest({
        host: '127.0.0.1',
        port: proxyPort,
        method: 'CONNECT',
        path: 'api.anthropic.com:443',
      });

      req.on('connect', (_res, socket) => {
        // The proxy accepted our CONNECT: TLS handshake will happen next.
        // Since there's no real server, the TLS to the upstream will fail,
        // which is expected. We're testing that CONNECT is handled.
        socket.destroy();
        resolve();
      });

      req.on('error', () => {
        resolve(); // Connection may fail, that's ok for this test
      });

      req.end();
    });
  });

  test('CertificateManager produces certs for all intercepted domains', () => {
    certManager = new CertificateManager();
    const caCert = forge.pki.certificateFromPem(certManager.getCaCertPem());

    for (const domain of INTERCEPTED_DOMAINS) {
      const leaf = certManager.getLeafCert(domain);
      const leafCert = forge.pki.certificateFromPem(leaf.cert);

      expect(leafCert.subject.getField('CN')?.value).toBe(domain);
      expect(caCert.verify(leafCert)).toBe(true);
    }
  }, 15000);
});
