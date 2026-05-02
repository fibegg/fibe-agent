export const UI_EFFECTS_STORAGE_KEY = 'chat-ui-effects-enabled';
export const UI_EFFECTS_CHANGED_EVENT = 'fibe:ui-effects-changed';

export interface SetUiEffectsMessage {
  action: 'set_ui_effects';
  enabled: boolean;
}

let frameListenerInitialized = false;

export function isSetUiEffectsMessage(data: unknown): data is SetUiEffectsMessage {
  const o = data as Record<string, unknown> | null;
  return (
    o !== null &&
    typeof o === 'object' &&
    o.action === 'set_ui_effects' &&
    typeof o.enabled === 'boolean'
  );
}

export function areUiEffectsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.localStorage.getItem(UI_EFFECTS_STORAGE_KEY);
    if (stored === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

function applyUiEffects(enabled: boolean): void {
  if (typeof document === 'undefined') return;
  if (enabled) {
    delete document.documentElement.dataset.uiEffects;
  } else {
    document.documentElement.dataset.uiEffects = 'reduced';
  }
}

export function setUiEffectsEnabled(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(UI_EFFECTS_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {
      // Ignore storage failures in private browsing or constrained webviews.
    }
  }

  applyUiEffects(enabled);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UI_EFFECTS_CHANGED_EVENT, { detail: { enabled } }));
  }
}

function initFrameUiEffectsListener(): void {
  if (typeof window === 'undefined' || window === window.parent || frameListenerInitialized) return;
  frameListenerInitialized = true;

  window.addEventListener('message', (event: MessageEvent) => {
    if (!isSetUiEffectsMessage(event.data)) return;
    setUiEffectsEnabled(event.data.enabled);
  });
}

export function initUiEffects(): void {
  applyUiEffects(areUiEffectsEnabled());
  initFrameUiEffectsListener();
}
