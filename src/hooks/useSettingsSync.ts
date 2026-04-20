import { useEffect, useRef } from 'react';

type SettingsPayload = Partial<{
  lang: 'en' | 'zh-TW';
  chartMode: 'nominal' | 'percent';
}>;

/**
 * Cross-tab synchronization for the consolidated `marketflow_settings` key.
 *
 * Subscribes to `storage` events, parses the JSON payload safely, validates
 * the fields and invokes `onChange` with only the recognised values.
 *
 * A ref holds the latest callback so consumers don't need to memoize it.
 */
export function useSettingsSync(
  onChange: (settings: SettingsPayload) => void
): void {
  const callbackRef = useRef(onChange);

  useEffect(() => {
    callbackRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key !== 'marketflow_settings' || !e.newValue) return;
      try {
        const updated = JSON.parse(e.newValue);
        const payload: SettingsPayload = {};
        if (updated.lang === 'en' || updated.lang === 'zh-TW') {
          payload.lang = updated.lang;
        }
        if (updated.chartMode === 'nominal' || updated.chartMode === 'percent') {
          payload.chartMode = updated.chartMode;
        }
        callbackRef.current(payload);
      } catch {
        /* ignore parse errors */
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);
}
