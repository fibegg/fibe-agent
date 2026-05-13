export type PreviewDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface PreviewDiagnosticIssue {
  code: string;
  severity: PreviewDiagnosticSeverity;
  title: string;
  detail: string;
}

export interface PreviewDiagnosticRedirect {
  from: string;
  to: string;
  status: number;
}

export interface PreviewDiagnosticsResult {
  url: string;
  finalUrl: string;
  ok: boolean;
  status?: number;
  statusText?: string;
  reachable: boolean;
  displayable: boolean;
  redirects: PreviewDiagnosticRedirect[];
  issues: PreviewDiagnosticIssue[];
}

const MAX_REDIRECTS = 5;
const PREVIEW_PROBE_TIMEOUT_MS = 5000;

export async function diagnosePreviewUrl(rawUrl: string): Promise<PreviewDiagnosticsResult> {
  const normalized = normalizeProbeUrl(rawUrl);
  const base: PreviewDiagnosticsResult = {
    url: normalized,
    finalUrl: normalized,
    ok: false,
    reachable: false,
    displayable: false,
    redirects: [],
    issues: [],
  };

  let currentUrl = normalized;
  let response: Response | null = null;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    try {
      response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(PREVIEW_PROBE_TIMEOUT_MS),
        headers: {
          'Cache-Control': 'no-cache',
          'User-Agent': 'fibe-agent-preview-diagnostics/1.0',
        },
      });
    } catch (error) {
      return {
        ...base,
        finalUrl: currentUrl,
        issues: [
          ...base.issues,
          {
            code: 'preview_unreachable',
            severity: 'error',
            title: 'Preview is unreachable',
            detail: error instanceof Error ? error.message : 'The preview URL could not be fetched.',
          },
        ],
      };
    }

    if (!isRedirectStatus(response.status)) break;
    const location = response.headers.get('location');
    if (!location) break;

    const nextUrl = new URL(location, currentUrl).toString();
    base.redirects.push({ from: currentUrl, to: nextUrl, status: response.status });
    currentUrl = nextUrl;
  }

  if (!response) return base;

  const finalUrl = currentUrl;
  const issues = [
    ...base.issues,
    ...diagnoseUrlShape(normalized, finalUrl, base.redirects),
    ...diagnoseFrameHeaders(response.headers),
    ...diagnoseCookies(response.headers, finalUrl),
    ...diagnoseCors(response.headers),
    ...diagnoseStatus(response.status, response.statusText),
  ];
  const displayBlocked = issues.some((issue) => issue.code.startsWith('iframe_') && issue.severity === 'error');

  return {
    url: normalized,
    finalUrl,
    ok: response.ok && !displayBlocked,
    status: response.status,
    statusText: response.statusText,
    reachable: true,
    displayable: !displayBlocked,
    redirects: base.redirects,
    issues,
  };
}

export function normalizeProbeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error('Preview URL is required');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withScheme);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Preview URL must use http or https');
  }
  return parsed.toString();
}

function diagnoseUrlShape(originalUrl: string, finalUrl: string, redirects: PreviewDiagnosticRedirect[]): PreviewDiagnosticIssue[] {
  const issues: PreviewDiagnosticIssue[] = [];
  const original = new URL(originalUrl);
  const final = new URL(finalUrl);

  if (original.protocol === 'http:') {
    issues.push({
      code: 'url_insecure_http',
      severity: 'warning',
      title: 'Preview uses HTTP',
      detail: 'Secure cookies, CHIPS/Partitioned cookies, and many browser APIs require HTTPS.',
    });
  }
  if (original.protocol === 'https:' && final.protocol === 'http:') {
    issues.push({
      code: 'redirect_downgrade_http',
      severity: 'error',
      title: 'Redirect downgrades to HTTP',
      detail: 'The preview starts on HTTPS but redirects to HTTP, which will break Secure cookies and can be blocked by browsers.',
    });
  }
  if (redirects.length > MAX_REDIRECTS) {
    issues.push({
      code: 'too_many_redirects',
      severity: 'error',
      title: 'Too many redirects',
      detail: `The preview redirected more than ${MAX_REDIRECTS} times.`,
    });
  }
  if (original.hostname !== final.hostname) {
    issues.push({
      code: 'redirect_cross_host',
      severity: 'info',
      title: 'Preview redirects to another host',
      detail: `The preview starts at ${original.hostname} and ends at ${final.hostname}. Check cookie domains and callback URLs.`,
    });
  }

  return issues;
}

function diagnoseStatus(status: number, statusText: string): PreviewDiagnosticIssue[] {
  if (status >= 500) {
    return [{ code: 'status_server_error', severity: 'error', title: 'Preview server error', detail: `The preview returned ${status} ${statusText}.` }];
  }
  if (status >= 400) {
    return [{ code: 'status_client_error', severity: 'warning', title: 'Preview returned an error page', detail: `The preview returned ${status} ${statusText}.` }];
  }
  return [];
}

function diagnoseFrameHeaders(headers: Headers): PreviewDiagnosticIssue[] {
  const issues: PreviewDiagnosticIssue[] = [];
  const xfo = headers.get('x-frame-options')?.trim();
  if (xfo) {
    const normalized = xfo.toLowerCase();
    if (normalized === 'deny' || normalized === 'sameorigin' || normalized.startsWith('allow-from')) {
      issues.push({
        code: 'iframe_x_frame_options',
        severity: 'error',
        title: 'Iframe is blocked by X-Frame-Options',
        detail: `The preview responds with X-Frame-Options: ${xfo}. It may not render inside fibe-agent.`,
      });
    }
  }

  const csp = headers.get('content-security-policy')?.trim();
  const frameAncestors = csp?.split(';').map((part) => part.trim()).find((part) => part.toLowerCase().startsWith('frame-ancestors'));
  if (frameAncestors) {
    const normalized = frameAncestors.toLowerCase();
    if (normalized.includes("'none'") || normalized.includes("'self'")) {
      issues.push({
        code: 'iframe_csp_frame_ancestors',
        severity: 'error',
        title: 'Iframe is blocked by CSP',
        detail: `The preview responds with ${frameAncestors}. Allow the fibe host in frame-ancestors to embed it.`,
      });
    } else {
      issues.push({
        code: 'iframe_csp_frame_ancestors_restricted',
        severity: 'info',
        title: 'Iframe CSP is restricted',
        detail: `The preview sets ${frameAncestors}. Confirm the fibe host is included.`,
      });
    }
  }

  return issues;
}

function diagnoseCookies(headers: Headers, finalUrl: string): PreviewDiagnosticIssue[] {
  const final = new URL(finalUrl);
  const cookies = getSetCookieHeaders(headers);
  const issues: PreviewDiagnosticIssue[] = [];

  for (const cookie of cookies) {
    const parsed = parseSetCookie(cookie);
    if (!parsed.name) continue;
    const attrs = parsed.attrs;
    const secure = attrs.has('secure');
    const sameSite = attrs.get('samesite')?.toLowerCase();
    const partitioned = attrs.has('partitioned');
    const domain = attrs.get('domain');

    if (secure && final.protocol !== 'https:') {
      issues.push({
        code: 'cookie_secure_over_http',
        severity: 'warning',
        title: 'Secure cookie on HTTP preview',
        detail: `${parsed.name} is Secure but the final preview URL is HTTP, so the browser will not store it.`,
      });
    }
    if (sameSite === 'none' && !secure) {
      issues.push({
        code: 'cookie_samesite_none_without_secure',
        severity: 'error',
        title: 'SameSite=None cookie misses Secure',
        detail: `${parsed.name} uses SameSite=None without Secure. Modern browsers reject this cookie.`,
      });
    }
    if (!sameSite) {
      issues.push({
        code: 'cookie_missing_samesite',
        severity: 'info',
        title: 'Cookie has no SameSite attribute',
        detail: `${parsed.name} has no SameSite attribute. In embedded/cross-site preview flows, it may behave as Lax and not be sent where expected.`,
      });
    }
    if (partitioned && !secure) {
      issues.push({
        code: 'cookie_partitioned_without_secure',
        severity: 'error',
        title: 'Partitioned cookie misses Secure',
        detail: `${parsed.name} uses Partitioned/CHIPS without Secure. Browsers require Secure for Partitioned cookies.`,
      });
    }
    if (partitioned && domain) {
      issues.push({
        code: 'cookie_partitioned_with_domain',
        severity: 'info',
        title: 'Partitioned cookie uses Domain',
        detail: `${parsed.name} is Partitioned and sets Domain=${domain}. Prefer a host-only __Host- cookie for CHIPS isolation.`,
      });
    }
    if (domain && !cookieDomainMatches(domain, final.hostname)) {
      issues.push({
        code: 'cookie_domain_mismatch',
        severity: 'error',
        title: 'Cookie domain does not match preview host',
        detail: `${parsed.name} sets Domain=${domain}, but the final preview host is ${final.hostname}. The browser will reject it.`,
      });
    }
  }

  return issues;
}

function diagnoseCors(headers: Headers): PreviewDiagnosticIssue[] {
  const allowOrigin = headers.get('access-control-allow-origin')?.trim();
  const allowCredentials = headers.get('access-control-allow-credentials')?.trim().toLowerCase();
  if (allowOrigin === '*' && allowCredentials === 'true') {
    return [{
      code: 'cors_wildcard_with_credentials',
      severity: 'warning',
      title: 'CORS wildcard conflicts with credentials',
      detail: 'Access-Control-Allow-Origin: * cannot be used with credentialed requests. Use an explicit origin when cookies/auth are needed.',
    }];
  }
  return [];
}

function getSetCookieHeaders(headers: Headers): string[] {
  const maybeGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof maybeGetSetCookie.getSetCookie === 'function') {
    return maybeGetSetCookie.getSetCookie();
  }
  const single = headers.get('set-cookie');
  return single ? splitCombinedSetCookie(single) : [];
}

function splitCombinedSetCookie(value: string): string[] {
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g).map((part) => part.trim()).filter(Boolean);
}

function parseSetCookie(cookie: string): { name: string; attrs: Map<string, string> } {
  const parts = cookie.split(';').map((part) => part.trim()).filter(Boolean);
  const [namePair = ''] = parts;
  const name = namePair.split('=')[0]?.trim() ?? '';
  const attrs = new Map<string, string>();

  for (const attr of parts.slice(1)) {
    const [rawKey, ...rawValue] = attr.split('=');
    const key = rawKey.trim().toLowerCase();
    attrs.set(key, rawValue.join('=').trim());
  }

  return { name, attrs };
}

function cookieDomainMatches(rawDomain: string, hostname: string): boolean {
  const domain = rawDomain.trim().replace(/^\./, '').toLowerCase();
  const host = hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}
