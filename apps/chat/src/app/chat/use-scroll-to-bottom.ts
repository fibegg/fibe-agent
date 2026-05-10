import { useCallback, useEffect, useRef, useState } from 'react';
import { safeScrollIntoView } from '../browser-compat';

export const SCROLL_AT_BOTTOM_THRESHOLD_PX = 80;

export function isScrollAtBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  thresholdPx: number = SCROLL_AT_BOTTOM_THRESHOLD_PX
): boolean {
  return scrollHeight - scrollTop - clientHeight <= thresholdPx;
}

export function useScrollToBottom(whenToScroll: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const userWasAtBottomRef = useRef(true);
  const userJustSentRef = useRef(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);

  const prevAtBottomRef = useRef(true);
  const checkAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    const atBottom = isScrollAtBottom(
      el.scrollHeight,
      el.scrollTop,
      el.clientHeight
    );
    userWasAtBottomRef.current = atBottom;
    const changed = prevAtBottomRef.current !== atBottom;
    prevAtBottomRef.current = atBottom;
    if (changed) {
      setIsAtBottom(atBottom);
      if (atBottom) setNewMessageCount(0);
    }
    return atBottom;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    safeScrollIntoView(endRef.current, { behavior });
    userWasAtBottomRef.current = true;
    setIsAtBottom(true);
    setNewMessageCount(0);
  }, []);

  const mountedRef = useRef(false);

  useEffect(() => {
    // Skip the initial mount — there's nothing to scroll to yet
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (!userWasAtBottomRef.current && !userJustSentRef.current) {
      // Scrolled up — count new arrivals
      setNewMessageCount((n) => n + 1);
      return;
    }
    // Defer past current render so the DOM has finished updating
    const id = setTimeout(() => {
      safeScrollIntoView(endRef.current, { behavior: 'smooth' });
      userJustSentRef.current = false;
      userWasAtBottomRef.current = true;
      if (!prevAtBottomRef.current) {
        prevAtBottomRef.current = true;
        setIsAtBottom(true);
      }
    }, 0);
    return () => clearTimeout(id);
  }, [whenToScroll]);

  const onScroll = useCallback(() => {
    checkAtBottom();
  }, [checkAtBottom]);

  const markJustSent = useCallback(() => {
    userJustSentRef.current = true;
  }, []);

  return {
    scrollRef,
    endRef,
    isAtBottom,
    newMessageCount,
    scrollToBottom,
    onScroll,
    markJustSent,
  };
}


