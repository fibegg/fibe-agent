import { createServer, type Server, type IncomingMessage } from 'node:http';
import { connect as tlsConnect, createServer as createTlsServer, type TLSSocket } from 'node:tls';
import { type Socket } from 'node:net';
import { Logger } from '@nestjs/common';
import type { CertificateManager } from './certificate-manager';
import { TrafficRecorder } from './traffic-recorder';
import { INTERCEPTED_DOMAINS, type CapturedProviderRequest } from './types';

export interface ConnectProxyOptions {
  certManager: CertificateManager;
  onCapturedRequest: (record: CapturedProviderRequest) => void;
  maxBodySize?: number;
  redactBodies?: boolean;
}

/**
 * An HTTP CONNECT proxy that intercepts TLS connections to known AI
 * provider domains and records request/response data. Connections to
 * other domains are tunneled through without interception.
 */
export class ConnectProxy {
  private readonly logger = new Logger('ConnectProxy');
  private readonly server: Server;
  private port = 0;

  constructor(private readonly options: ConnectProxyOptions) {
    this.server = createServer((_req, res) => {
      // Regular HTTP requests are not expected — reject them.
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('This proxy only supports CONNECT tunneling.');
    });

    this.server.on('connect', (req: IncomingMessage, clientSocket: Socket, head: Buffer) => {
      this.handleConnect(req, clientSocket, head);
    });

    this.server.on('error', (err) => {
      this.logger.error(`Proxy server error: ${err.message}`);
    });
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
          this.logger.log(`MITM proxy listening on 127.0.0.1:${this.port}`);
          resolve(this.port);
        } else {
          reject(new Error('Failed to determine proxy port'));
        }
      });
      this.server.once('error', reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
      // Force-destroy any lingering connections
      setTimeout(() => resolve(), 2000);
    });
  }

  getPort(): number {
    return this.port;
  }

  // ── CONNECT handler ────────────────────────────────────────────

  private handleConnect(req: IncomingMessage, clientSocket: Socket, head: Buffer): void {
    const target = req.url ?? '';
    const [hostname, portStr] = target.split(':');
    const port = parseInt(portStr ?? '443', 10);

    if (!hostname) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }

    if (INTERCEPTED_DOMAINS.has(hostname)) {
      this.handleInterceptedConnect(hostname, port, clientSocket, head);
    } else {
      this.handlePassthroughConnect(hostname, port, clientSocket, head);
    }
  }

  /**
   * For known provider domains: terminate TLS on both sides, record traffic.
   */
  private handleInterceptedConnect(
    hostname: string,
    port: number,
    clientSocket: Socket,
    head: Buffer
  ): void {
    // Tell client the tunnel is established
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    const recorder = new TrafficRecorder(hostname, port, this.options.onCapturedRequest, {
      maxBodySize: this.options.maxBodySize,
      redactBodies: this.options.redactBodies,
    });

    const leafCert = this.options.certManager.getLeafCert(hostname);

    // Create a TLS server that wraps the client socket
    // The client will perform a TLS handshake with our leaf cert
    const clientTls = createTlsServer(
      {
        key: leafCert.key,
        cert: leafCert.cert,
        ALPNProtocols: ['http/1.1'], // Force HTTP/1.1
      },
      (cleartextClientStream: TLSSocket) => {
        // Now connect to the real provider over TLS
        const serverTls = tlsConnect(
          {
            host: hostname,
            port,
            servername: hostname,
            ALPNProtocols: ['http/1.1'],
          },
          () => {
            // Pipe data bidirectionally, recording along the way
            cleartextClientStream.on('data', (chunk: Buffer) => {
              recorder.feedRequest(chunk);
              if (!serverTls.destroyed) serverTls.write(chunk);
            });

            serverTls.on('data', (chunk: Buffer) => {
              recorder.feedResponse(chunk);
              if (!cleartextClientStream.destroyed) cleartextClientStream.write(chunk);
            });
          }
        );

        serverTls.on('error', (err) => {
          this.logger.warn(`Server TLS error (${hostname}): ${err.message}`);
          recorder.end(`server_error: ${err.message}`);
          cleartextClientStream.destroy();
        });

        cleartextClientStream.on('error', (err) => {
          this.logger.warn(`Client TLS error (${hostname}): ${err.message}`);
          recorder.end(`client_error: ${err.message}`);
          serverTls.destroy();
        });

        const cleanup = (reason: string) => {
          recorder.end(cleartextClientStream.destroyed && serverTls.destroyed ? reason : undefined);
          if (!cleartextClientStream.destroyed) cleartextClientStream.destroy();
          if (!serverTls.destroyed) serverTls.destroy();
        };

        cleartextClientStream.on('end', () => cleanup('client_disconnected'));
        serverTls.on('end', () => cleanup(undefined as unknown as string));
        cleartextClientStream.on('close', () => cleanup('client_closed'));
        serverTls.on('close', () => cleanup(undefined as unknown as string));
      }
    );

    // Feed the existing head buffer and then pipe the raw client socket
    // into our TLS server to initiate the handshake
    clientTls.emit('connection', clientSocket);
    if (head.length > 0) {
      clientSocket.unshift(head);
    }

    clientSocket.on('error', (err) => {
      this.logger.warn(`Client socket error: ${err.message}`);
      recorder.end(`socket_error: ${err.message}`);
    });
  }

  /**
   * For unknown domains: simple TCP tunnel passthrough (no interception).
   */
  private handlePassthroughConnect(
    hostname: string,
    port: number,
    clientSocket: Socket,
    head: Buffer
  ): void {
    const { createConnection } = require('node:net');
    const serverSocket: Socket = createConnection({ host: hostname, port }, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) serverSocket.write(head);
      clientSocket.pipe(serverSocket);
      serverSocket.pipe(clientSocket);
    });

    serverSocket.on('error', (err: Error) => {
      this.logger.warn(`Passthrough tunnel error (${hostname}:${port}): ${err.message}`);
      clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    });

    clientSocket.on('error', () => {
      serverSocket.destroy();
    });
  }
}
