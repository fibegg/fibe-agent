/**
 * PostMessage Greeting Listener
 *
 * Listens for `{ action: "initial_greeting", text: string }` messages from
 * the parent window (Phoenix Bridge iframe host). Stores the greeting text
 * so that ChatPage can consume it once after authentication completes and
 * the initial message history has been loaded.
 *
 * This mirrors postmessage-auth.ts in structure — a module-level listener
 * that captures data before React components mount.
 */

let pendingGreeting: string | null = null;

function onMessage(event: MessageEvent): void {
  const data = event.data as { action?: string; text?: string } | undefined;
  if (!data || data.action !== 'initial_greeting' || typeof data.text !== 'string') return;

  // Only store the first greeting — subsequent retries from the parent are idempotent
  if (pendingGreeting === null) {
    pendingGreeting = data.text;
  }
}

/**
 * Returns the stored greeting text and clears it (one-shot).
 * Returns null if no greeting has been received.
 */
export function consumeGreeting(): string | null {
  const text = pendingGreeting;
  pendingGreeting = null;
  return text;
}

/**
 * Peek at the pending greeting without consuming it.
 * Useful for conditional checks before the right moment to consume.
 */
export function peekGreeting(): string | null {
  return pendingGreeting;
}

// Attach the listener only when running inside an iframe
const LISTENER_KEY = '__initial_greeting_listener';
if (typeof window !== 'undefined' && window !== window.parent) {
  const existing = window[LISTENER_KEY];
  if (existing) {
    window.removeEventListener('message', existing);
  }
  window.addEventListener('message', onMessage);
  window[LISTENER_KEY] = onMessage;
}
