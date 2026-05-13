export interface PlaygroundPreviewService {
  id: string;
  name: string;
  url: string;
  source?: 'cli' | 'parent';
}

type RawService = string | { name?: unknown; service?: unknown; url?: unknown };

export function normalizePlaygroundServices(
  input: unknown,
  source: PlaygroundPreviewService['source'] = 'cli',
): PlaygroundPreviewService[] {
  const rawItems = Array.isArray(input) ? input : [];
  const services: PlaygroundPreviewService[] = [];
  const seen = new Set<string>();

  for (const item of rawItems as RawService[]) {
    const parsed = parseRawService(item);
    if (!parsed) continue;

    const key = `${parsed.name}\n${parsed.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    services.push({
      id: serviceId(parsed.name, parsed.url),
      name: parsed.name,
      url: parsed.url,
      source,
    });
  }

  return services;
}

function parseRawService(item: RawService): { name: string; url: string } | null {
  if (typeof item === 'string') {
    const [rawName, ...urlParts] = item.includes('|') ? item.split('|') : ['', item];
    const rawUrl = urlParts.join('|');
    return normalizeServiceParts(rawName, rawUrl);
  }

  if (!item || typeof item !== 'object') return null;
  const name = typeof item.name === 'string' ? item.name : typeof item.service === 'string' ? item.service : '';
  const url = typeof item.url === 'string' ? item.url : '';
  return normalizeServiceParts(name, url);
}

function normalizeServiceParts(rawName: string, rawUrl: string): { name: string; url: string } | null {
  const url = normalizeServiceUrl(rawUrl);
  if (!url) return null;

  const name = (rawName || inferServiceName(url)).trim() || 'service';
  return { name, url };
}

export function normalizeServiceUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function inferServiceName(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.split('.')[0] || 'service';
  } catch {
    return 'service';
  }
}

function serviceId(name: string, url: string): string {
  return `${name}:${url}`.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}
