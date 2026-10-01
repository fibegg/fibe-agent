/** Buffers the parent's initial greeting until ChatPage consumes it. */

let pendingGreeting: string | null = null;

function onMessage(event: MessageEvent): void {
  const data = event.data as { action?: string; text?: string } | undefined;
  if (
    !data ||
    data.action !== 'initial_greeting' ||
    typeof data.text !== 'string'
  )
    return;

  // The parent retries, so only keep the first greeting.
  if (pendingGreeting === null) {
    pendingGreeting = data.text;
  }
}

/** Returns and clears the pending greeting. */
export function consumeGreeting(): string | null {
  const text = pendingGreeting;
  pendingGreeting = null;
  return text;
}

/** Returns the pending greeting without clearing it. */
export function peekGreeting(): string | null {
  return pendingGreeting;
}

const LISTENER_KEY = '__initial_greeting_listener';
if (typeof window !== 'undefined' && window !== window.parent) {
  const existing = window[LISTENER_KEY];
  if (existing) {
    window.removeEventListener('message', existing);
  }
  window.addEventListener('message', onMessage);
  window[LISTENER_KEY] = onMessage;
}
