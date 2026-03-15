import { useCallback, useEffect, useRef, useState } from 'react';

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
    if (changed) setIsAtBottom(atBottom);
    return atBottom;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    endRef.current?.scrollIntoView({ behavior });
    userWasAtBottomRef.current = true;
    setIsAtBottom(true);
  }, []);

  useEffect(() => {
    if (!userWasAtBottomRef.current && !userJustSentRef.current) return;
    const id = requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      userJustSentRef.current = false;
      userWasAtBottomRef.current = true;
      setIsAtBottom(true);
    });
    return () => cancelAnimationFrame(id);
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
    scrollToBottom,
    onScroll,
    markJustSent,
  };
}
