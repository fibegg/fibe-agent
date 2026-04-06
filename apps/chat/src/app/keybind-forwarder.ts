/**
 * Keybind Forwarder — bridges keyboard shortcuts from iframe to parent window.
 *
 * When fibe-agent runs inside an iframe (Bridge view), keyboard shortcuts like
 * Ctrl+N (new agent) or Ctrl+1..9 (tab switching) are swallowed by the iframe
 * and never reach the parent's bridge_tabs_controller.
 *
 * This module captures keydown events with modifier keys (Ctrl/Meta) during
 * the capture phase and forwards them to the parent via postMessage. The parent
 * synthesizes a native KeyboardEvent, triggering all existing shortcut handlers.
 *
 * Only active when `window !== window.parent` (iframe mode).
 * Does NOT preventDefault or stopPropagation — the event continues normally
 * inside the iframe too (e.g. Ctrl+A still selects text in the chat input).
 */

/** Keys that should never be forwarded even with modifiers — they serve
 *  essential functions inside the chat (copy, paste, undo, select-all, etc.) */
const SUPPRESSED_KEYS = new Set([
  'c', 'v', 'x', 'a', 'z', 'y',  // clipboard & undo/redo
  'f',                              // browser find
  'r',                              // browser reload
  't',                              // browser new tab
]);

function isStandaloneMode(): boolean {
  return typeof window === 'undefined' || window === window.parent;
}

function shouldForward(e: KeyboardEvent): boolean {
  // Must have Ctrl or Meta pressed (the modifiers used by bridge_tabs shortcuts)
  if (!e.ctrlKey && !e.metaKey) return false;

  // Pure modifier-only keystrokes (e.g. pressing Ctrl alone)
  if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return false;

  // Derive the layout-agnostic key (same logic as bridge_tabs_controller)
  let actionKey = e.key.toLowerCase();
  if (e.code) {
    if (e.code.startsWith('Key') && e.code.length === 4) {
      actionKey = e.code.charAt(3).toLowerCase();
    } else if (e.code.startsWith('Digit') && e.code.length === 6) {
      actionKey = e.code.charAt(5);
    }
  }

  // Don't hijack essential browser/editing shortcuts
  if (SUPPRESSED_KEYS.has(actionKey) && !e.shiftKey) return false;

  return true;
}

function onKeydown(e: KeyboardEvent): void {
  if (!shouldForward(e)) return;

  try {
    window.parent.postMessage(
      {
        type: 'keybind_forward',
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      },
      '*',
    );
  } catch {
    // Cross-origin or sandboxed — silently ignore
  }
}

if (!isStandaloneMode()) {
  document.addEventListener('keydown', onKeydown, true);
}
