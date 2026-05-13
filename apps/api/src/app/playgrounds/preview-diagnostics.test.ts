import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { diagnosePreviewUrl, normalizeProbeUrl } from './preview-diagnostics';

const originalFetch = globalThis.fetch;

describe('preview diagnostics', () => {
  beforeEach(() => {
    globalThis.fetch = mock() as never;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('normalizes host-only urls to https', () => {
    expect(normalizeProbeUrl('app.example.test')).toBe('https://app.example.test/');
  });

  test('reports iframe blocking headers', async () => {
    mockFetchResponse(200, {
      'x-frame-options': 'SAMEORIGIN',
      'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
    });

    const result = await diagnosePreviewUrl('https://app.example.test');

    expect(result.displayable).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('iframe_x_frame_options');
    expect(result.issues.map((issue) => issue.code)).toContain('iframe_csp_frame_ancestors');
  });

  test('reports broken cookie attributes for embedded previews', async () => {
    mockFetchResponse(200, {
      'set-cookie': [
        'sid=1; SameSite=None; Path=/',
        'chip=1; Partitioned; Domain=wrong.example.test; Path=/',
      ],
    });

    const result = await diagnosePreviewUrl('https://app.example.test');
    const codes = result.issues.map((issue) => issue.code);

    expect(codes).toContain('cookie_samesite_none_without_secure');
    expect(codes).toContain('cookie_partitioned_without_secure');
    expect(codes).toContain('cookie_domain_mismatch');
  });

  test('reports secure cookies over http and insecure preview urls', async () => {
    mockFetchResponse(200, { 'set-cookie': 'sid=1; Secure; Path=/' });

    const result = await diagnosePreviewUrl('http://app.example.test');
    const codes = result.issues.map((issue) => issue.code);

    expect(codes).toContain('url_insecure_http');
    expect(codes).toContain('cookie_secure_over_http');
  });

  test('captures redirects and final host changes', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
    fetchMock
      .mockResolvedValueOnce(makeResponse(302, { location: 'https://admin.example.test' }))
      .mockResolvedValueOnce(makeResponse(200));

    const result = await diagnosePreviewUrl('https://app.example.test');

    expect(result.finalUrl).toBe('https://admin.example.test/');
    expect(result.redirects).toHaveLength(1);
    expect(result.issues.map((issue) => issue.code)).toContain('redirect_cross_host');
  });

  test('reports wildcard cors with credentials', async () => {
    mockFetchResponse(200, {
      'access-control-allow-origin': '*',
      'access-control-allow-credentials': 'true',
    });

    const result = await diagnosePreviewUrl('https://app.example.test');

    expect(result.issues.map((issue) => issue.code)).toContain('cors_wildcard_with_credentials');
  });

  test('reports fetch failures as unreachable diagnostics', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
    fetchMock.mockRejectedValueOnce(new Error('certificate has expired'));

    const result = await diagnosePreviewUrl('https://app.example.test');

    expect(result.reachable).toBe(false);
    expect(result.issues[0]).toEqual(expect.objectContaining({ code: 'preview_unreachable' }));
  });
});

function mockFetchResponse(status: number, headers: Record<string, string | string[]> = {}) {
  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
  fetchMock.mockResolvedValue(makeResponse(status, headers));
}

function makeResponse(status: number, headers: Record<string, string | string[]> = {}) {
  const headerBag = new Headers();
  const setCookie: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'set-cookie') {
      setCookie.push(...(Array.isArray(value) ? value : [value]));
      continue;
    }
    headerBag.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  if (setCookie.length > 0) {
    (headerBag as Headers & { getSetCookie?: () => string[] }).getSetCookie = () => setCookie;
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Found',
    headers: headerBag,
  } as Response;
}
