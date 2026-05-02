import { useEffect, useState } from 'react';
import { areUiEffectsEnabled, UI_EFFECTS_CHANGED_EVENT, UI_EFFECTS_STORAGE_KEY } from './ui-effects';

export function useUiEffectsEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => areUiEffectsEnabled());

  useEffect(() => {
    const sync = () => setEnabled(areUiEffectsEnabled());
    const onPreferenceChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      if (typeof detail?.enabled === 'boolean') {
        setEnabled(detail.enabled);
      } else {
        sync();
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === UI_EFFECTS_STORAGE_KEY) sync();
    };

    window.addEventListener(UI_EFFECTS_CHANGED_EVENT, onPreferenceChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(UI_EFFECTS_CHANGED_EVENT, onPreferenceChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return enabled;
}
