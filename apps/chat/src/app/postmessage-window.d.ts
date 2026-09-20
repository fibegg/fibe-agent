/** Window state used to deduplicate postMessage listeners. */
interface Window {
  __auto_auth_listener?: (event: MessageEvent) => void;
  __initial_greeting_listener?: (event: MessageEvent) => void;
  __locale_listener?: (event: MessageEvent) => void;
  __FIBE_BOOT_LOCALE__?: string;
}
