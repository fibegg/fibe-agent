/**
 * Forwards iframe Ctrl/Meta shortcuts to the parent without consuming them,
 * while keeping essential browser and editing shortcuts local.
 */

/** Browser and editing shortcuts that stay inside the chat. */
const SUPPRESSED_KEYS = new Set([
  'c',
  'v',
  'x',
  'a',
  'z',
  'y', // clipboard & undo/redo
  'f', // browser find
  'r', // browser reload
  't', // browser new tab
]);

function isStandaloneMode(): boolean {
  return typeof window === 'undefined' || window === window.parent;
}

function shouldForward(e: KeyboardEvent): boolean {
  if (!e.ctrlKey && !e.metaKey) return false;

  if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return false;

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
    // A restrictive parent frame may reject cross-frame messages.
  }
}

if (!isStandaloneMode()) {
  document.addEventListener('keydown', onKeydown, true);
}
