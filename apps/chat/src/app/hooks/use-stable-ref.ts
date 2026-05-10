import { useRef } from 'react';

/**
 * Returns a stable ref whose `.current` is always the latest value.
 *
 * Use this to capture a callback inside a long-lived closure (e.g., a
 * WebSocket `onmessage` handler) without making the closure itself a
 * dependency — the ref is stable across renders while always reflecting
 * the newest value.
 *
 * @example
 * const onMessageRef = useStableRef(onMessage);
 * // later: onMessageRef.current(payload);
 */
export function useStableRef<T>(value: T): React.RefObject<T> {
  const ref = useRef<T>(value);
  ref.current = value;
  return ref;
}
