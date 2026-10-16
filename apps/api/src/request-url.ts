/** Redact credential query values without changing the URL used for routing/auth. */
export function sanitizeRequestUrl(resource: string): string {
  const queryStart = resource.indexOf('?');
  if (queryStart < 0) return resource.split('#', 1)[0];
  const path = resource.slice(0, queryStart);
  const query = new URLSearchParams(
    resource.slice(queryStart + 1).split('#', 1)[0],
  );
  for (const key of new Set(query.keys())) {
    if (
      /(?:token|password|secret|credential|authorization|api[-_]?key)/i.test(
        key,
      )
    ) {
      // set also removes duplicate instances of the same decoded key.
      query.set(key, '[REDACTED]');
    }
  }
  return `${path}?${query.toString()}`;
}
