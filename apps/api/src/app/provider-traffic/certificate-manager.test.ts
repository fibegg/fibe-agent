import { describe, test, expect, afterEach } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import forge from 'node-forge';
import { CertificateManager } from './certificate-manager';

describe('CertificateManager', () => {
  let manager: CertificateManager | null = null;

  afterEach(() => {
    manager?.cleanup();
    manager = null;
  });

  test('generates a CA cert and writes PEM to temp file', () => {
    manager = new CertificateManager();
    const caPath = manager.getCaCertPath();

    expect(existsSync(caPath)).toBe(true);
    expect(caPath).toContain('fibe-proxy-ca-');
    expect(caPath).toEndWith('.pem');

    const pem = readFileSync(caPath, 'utf-8');
    expect(pem).toContain('-----BEGIN CERTIFICATE-----');

    const cert = forge.pki.certificateFromPem(pem);
    expect(cert.subject.getField('CN')?.value).toBe('Fibe MITM Proxy CA');
    expect(cert.subject.getField('O')?.value).toBe('Fibe Agent (dev only)');
  });

  test('getCaCertPem returns valid PEM string', () => {
    manager = new CertificateManager();
    const pem = manager.getCaCertPem();

    expect(pem).toContain('-----BEGIN CERTIFICATE-----');
    const cert = forge.pki.certificateFromPem(pem);
    expect(cert.subject.getField('CN')?.value).toBe('Fibe MITM Proxy CA');
  });

  test('generates leaf cert signed by CA with correct SAN', () => {
    manager = new CertificateManager();
    const leaf = manager.getLeafCert('api.anthropic.com');

    expect(leaf.cert).toContain('-----BEGIN CERTIFICATE-----');
    expect(leaf.key).toContain('-----BEGIN RSA PRIVATE KEY-----');

    const leafCert = forge.pki.certificateFromPem(leaf.cert);
    expect(leafCert.subject.getField('CN')?.value).toBe('api.anthropic.com');

    // Verify signed by CA
    const caCert = forge.pki.certificateFromPem(manager.getCaCertPem());
    expect(caCert.verify(leafCert)).toBe(true);

    // Verify SAN
    const sanExt = leafCert.getExtension('subjectAltName') as { altNames?: { type: number; value: string }[] } | null;
    expect(sanExt).toBeTruthy();
    expect(sanExt?.altNames).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 2, value: 'api.anthropic.com' })])
    );
  });

  test('caches leaf certs per domain', () => {
    manager = new CertificateManager();
    const first = manager.getLeafCert('api.openai.com');
    const second = manager.getLeafCert('api.openai.com');

    expect(first.cert).toBe(second.cert);
    expect(first.key).toBe(second.key);
  });

  test('generates different certs for different domains', () => {
    manager = new CertificateManager();
    const anthro = manager.getLeafCert('api.anthropic.com');
    const openai = manager.getLeafCert('api.openai.com');

    expect(anthro.cert).not.toBe(openai.cert);
  });

  test('cleanup removes temp CA file', () => {
    manager = new CertificateManager();
    const caPath = manager.getCaCertPath();
    expect(existsSync(caPath)).toBe(true);

    manager.cleanup();
    expect(existsSync(caPath)).toBe(false);
    manager = null; // prevent double cleanup in afterEach
  });
});
