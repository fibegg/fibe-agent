import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import forge from 'node-forge';

export interface CertKeyPair {
  cert: string; // PEM
  key: string; // PEM
}

/**
 * Generates a self-signed CA at construction time and issues per-domain
 * leaf certificates on demand. The CA cert is written to a temp PEM file
 * so child processes can trust it via NODE_EXTRA_CA_CERTS.
 */
export class CertificateManager {
  private readonly caCert: forge.pki.Certificate;
  private readonly caKey: forge.pki.rsa.PrivateKey;
  private readonly caCertPem: string;
  private readonly leafCache = new Map<string, CertKeyPair>();
  private readonly caCertPath: string;

  constructor() {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    this.caKey = keys.privateKey;

    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);

    const attrs: forge.pki.CertificateField[] = [
      { name: 'commonName', value: 'Fibe MITM Proxy CA' },
      { name: 'organizationName', value: 'Fibe Agent (dev only)' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([
      { name: 'basicConstraints', cA: true },
      {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        cRLSign: true,
      },
    ]);
    cert.sign(this.caKey, forge.md.sha256.create());

    this.caCert = cert;
    this.caCertPem = forge.pki.certificateToPem(cert);

    this.caCertPath = join(tmpdir(), `fibe-proxy-ca-${process.pid}.pem`);
    writeFileSync(this.caCertPath, this.caCertPem);
  }

  /** Path to the CA certificate PEM file (for NODE_EXTRA_CA_CERTS). */
  getCaCertPath(): string {
    return this.caCertPath;
  }

  getCaCertPem(): string {
    return this.caCertPem;
  }

  /**
   * Returns a TLS key+cert for the given domain, signed by the CA.
   * Results are cached per domain.
   */
  getLeafCert(domain: string): CertKeyPair {
    const cached = this.leafCache.get(domain);
    if (cached) return cached;

    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = Date.now().toString(16);
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);

    cert.setSubject([{ name: 'commonName', value: domain }]);
    cert.setIssuer(this.caCert.subject.attributes);
    cert.setExtensions([
      {
        name: 'subjectAltName',
        altNames: [{ type: 2 /* DNS */, value: domain }],
      },
      { name: 'basicConstraints', cA: false },
      {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true,
      },
      {
        name: 'extKeyUsage',
        serverAuth: true,
      },
    ]);
    cert.sign(this.caKey, forge.md.sha256.create());

    const pair: CertKeyPair = {
      cert: forge.pki.certificateToPem(cert),
      key: forge.pki.privateKeyToPem(keys.privateKey),
    };
    this.leafCache.set(domain, pair);
    return pair;
  }

  /** Remove the temp CA cert file. */
  cleanup(): void {
    try {
      if (existsSync(this.caCertPath)) {
        unlinkSync(this.caCertPath);
      }
    } catch {
      // best-effort cleanup
    }
  }

  /** Remove stale CA files left by crashed previous processes. */
  static cleanupStale(): void {
    const dir = tmpdir();
    try {
      const { readdirSync } = require('node:fs');
      for (const file of readdirSync(dir) as string[]) {
        if (file.startsWith('fibe-proxy-ca-') && file.endsWith('.pem')) {
          const pidStr = file.slice('fibe-proxy-ca-'.length, -'.pem'.length);
          const pid = parseInt(pidStr, 10);
          if (!isNaN(pid) && !isProcessAlive(pid)) {
            try {
              unlinkSync(join(dir, file));
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
