import { useRef } from 'react';

/** Keeps the latest value behind a ref that stays stable across renders. */
export function useStableRef<T>(value: T): React.RefObject<T> {
  const ref = useRef<T>(value);
  ref.current = value;
  return ref;
}
