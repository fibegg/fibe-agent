import { API_PATHS } from '@shared/api-paths';
import { apiRequest } from '../api-url';

export type PreviewDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface PreviewDiagnosticIssue {
  code: string;
  severity: PreviewDiagnosticSeverity;
  title: string;
  detail: string;
}

export interface PreviewDiagnosticsResult {
  url: string;
  finalUrl: string;
  ok: boolean;
  status?: number;
  statusText?: string;
  reachable: boolean;
  displayable: boolean;
  redirects: Array<{ from: string; to: string; status: number }>;
  issues: PreviewDiagnosticIssue[];
}

export async function fetchPreviewDiagnostics(url: string, signal?: AbortSignal): Promise<PreviewDiagnosticsResult> {
  const params = new URLSearchParams({ url });
  const res = await apiRequest(`${API_PATHS.PLAYGROUNDS_PREVIEW_DIAGNOSTICS}?${params}`, { signal });
  if (!res.ok) throw new Error('Failed to load preview diagnostics');
  return res.json() as Promise<PreviewDiagnosticsResult>;
}
