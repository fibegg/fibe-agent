/** @internal */
function resolveAvatar(base64Global: string, urlGlobal: string): string | undefined {
  const b64 = (typeof base64Global !== 'undefined' ? base64Global : '').trim();
  if (b64) return `data:image/svg+xml;base64,${b64}`;
  return (typeof urlGlobal !== 'undefined' ? urlGlobal : '').trim() || undefined;
}

export const USER_AVATAR_URL = resolveAvatar(__USER_AVATAR_BASE64__, __USER_AVATAR_URL__);
export const ASSISTANT_AVATAR_URL = resolveAvatar(__ASSISTANT_AVATAR_BASE64__, __ASSISTANT_AVATAR_URL__);
