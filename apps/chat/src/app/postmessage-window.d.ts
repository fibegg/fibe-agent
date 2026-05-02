/**
 * Typed window extensions for postMessage module-level listener deduplication.
 *
 * The postMessage helper modules register at most one
 * listener per module by storing a reference under a unique key on `window`.
 * This declaration eliminates the `window as any` casts and makes the keys
 * self-documenting.
 */
interface Window {
  /** Stores the active `auto_auth` message listener for deduplication across HMR. */
  __auto_auth_listener?: (event: MessageEvent) => void;
  /** Stores the active `initial_greeting` message listener for deduplication across HMR. */
  __initial_greeting_listener?: (event: MessageEvent) => void;
  /** Stores the active `set_locale` message listener for deduplication across HMR. */
  __locale_listener?: (event: MessageEvent) => void;
  /** Locale parsed synchronously from the iframe URL before React boots. */
  __FIBE_BOOT_LOCALE__?: string;
}
