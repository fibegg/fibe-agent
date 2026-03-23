const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3100',
  'http://localhost:4300',
];

function parseList(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export function getCorsOrigin(env: NodeJS.ProcessEnv): true | string[] {
  const raw = env.CORS_ORIGINS?.trim();
  if (!raw || raw === '*') return true;
  const list = parseList(raw);
  return list.length > 0 ? list : DEFAULT_CORS_ORIGINS;
}

export function getFrameAncestors(env: NodeJS.ProcessEnv): string[] {
  const raw = env.FRAME_ANCESTORS?.trim();
  if (!raw) return ['*'];
  const list = parseList(env.FRAME_ANCESTORS ?? '');
  return list.length > 0 ? list : ['*'];
}
