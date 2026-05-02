let fallbackIdCounter = 0;

export function makeClientId(prefix = 'client'): string {
  const randomUUID = typeof crypto !== 'undefined' ? crypto.randomUUID : undefined;
  if (typeof randomUUID === 'function') {
    try {
      return randomUUID.call(crypto);
    } catch {
      /* fall through to local id */
    }
  }

  fallbackIdCounter += 1;
  const time = Date.now().toString(36);
  const counter = fallbackIdCounter.toString(36);
  const random = Math.random().toString(36).slice(2, 10) || '0';
  return `${prefix}-${time}-${counter}-${random}`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to legacy copy */
    }
  }

  return legacyCopyText(text);
}

export function safeScrollIntoView(
  element: Element | null | undefined,
  options?: ScrollIntoViewOptions
): void {
  if (!element || typeof element.scrollIntoView !== 'function') return;

  try {
    if (options) {
      element.scrollIntoView(options);
    } else {
      element.scrollIntoView();
    }
  } catch {
    element.scrollIntoView();
  }
}

function legacyCopyText(text: string): boolean {
  if (
    typeof document === 'undefined' ||
    !document.body ||
    typeof document.execCommand !== 'function'
  ) {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  const previousActive = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
    previousActive?.focus();
  }
}
