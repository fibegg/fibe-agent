const authenticated = new WeakSet<object>();

/** Only a successful credential check establishes this audit identity. */
export function markAuthenticated(request: object): void {
  authenticated.add(request);
}

export function isAuthenticated(request: object): boolean {
  return authenticated.has(request);
}
