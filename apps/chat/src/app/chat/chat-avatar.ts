export interface AvatarConfig {
  userAvatarUrl: string | undefined;
  assistantAvatarUrl: string | undefined;
}

/** @internal */
export function resolveAvatar(base64: string | null, url: string | null): string | undefined {
  const b64 = (base64 ?? '').trim();
  if (b64) {
    // Already a complete data URI (e.g. env var includes the data: prefix)
    if (b64.startsWith('data:')) return b64;
    return `data:image/svg+xml;base64,${b64}`;
  }
  return (url ?? '').trim() || undefined;
}


export async function loadAvatarConfig(): Promise<AvatarConfig> {
  try {
    const res = await fetch('/api/runtime-config');
    if (!res.ok) return { userAvatarUrl: undefined, assistantAvatarUrl: undefined };
    const cfg = await res.json() as {
      userAvatarUrl: string | null;
      userAvatarBase64: string | null;
      assistantAvatarUrl: string | null;
      assistantAvatarBase64: string | null;
    };
    return {
      userAvatarUrl: resolveAvatar(cfg.userAvatarBase64, cfg.userAvatarUrl),
      assistantAvatarUrl: resolveAvatar(cfg.assistantAvatarBase64, cfg.assistantAvatarUrl),
    };
  } catch {
    return { userAvatarUrl: undefined, assistantAvatarUrl: undefined };
  }
}
