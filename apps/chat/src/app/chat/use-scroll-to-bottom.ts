import { useCallback, useEffect, useRef, useState } from 'react';

export const SCROLL_AT_BOTTOM_THRESHOLD_PX = 80;

export function isScrollAtBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  thresholdPx: number = SCROLL_AT_BOTTOM_THRESHOLD_PX,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= thresholdPx;
}

export function nextNewMessageCount(
  currentCount: number,
  previousVisibleItemCount: number,
  visibleItemCount: number,
  currentItemUpdated = false,
): number {
  const newItemCount = Math.max(0, visibleItemCount - previousVisibleItemCount);
  if (newItemCount > 0) return currentCount + newItemCount;
  return currentItemUpdated ? Math.max(currentCount, 1) : currentCount;
}

export function useScrollToBottom(
  whenToScroll: unknown,
  visibleItemCount = 0,
  resetKey?: unknown,
  currentItemUpdated = false,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const userWasAtBottomRef = useRef(true);
  const userJustSentRef = useRef(false);
  const visibleItemCountRef = useRef(visibleItemCount);
  const resetKeyRef = useRef(resetKey);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);

  const prevAtBottomRef = useRef(true);
  const viewportSize = useRef<{ width: number; height: number } | null>(null);
  const scrollContainerToBottom = useCallback((behavior: ScrollBehavior) => {
    const el = scrollRef.current;
    if (!el) return;
    // scrollIntoView also scrolls ancestor frames, which pans the outer PWA on iOS.
    if (typeof el.scrollTo === 'function')
      el.scrollTo({ top: el.scrollHeight, behavior });
    else el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    viewportSize.current = { width: el.clientWidth, height: el.clientHeight };
    const resize = () => {
      const previous = viewportSize.current;
      const next = { width: el.clientWidth, height: el.clientHeight };
      viewportSize.current = next;
      if (
        !previous ||
        (previous.width === next.width && previous.height === next.height)
      )
        return;
      if (userWasAtBottomRef.current || userJustSentRef.current) {
        scrollContainerToBottom('instant');
      }
    };
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(resize);
    observer?.observe(el);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      viewportSize.current = null;
    };
  });
  const checkAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    const atBottom = isScrollAtBottom(
      el.scrollHeight,
      el.scrollTop,
      el.clientHeight,
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

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      scrollContainerToBottom(behavior);
      userWasAtBottomRef.current = true;
      setIsAtBottom(true);
      setNewMessageCount(0);
    },
    [scrollContainerToBottom],
  );

  const mountedRef = useRef(false);

  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      visibleItemCountRef.current = visibleItemCount;
      userWasAtBottomRef.current = true;
      prevAtBottomRef.current = true;
      setIsAtBottom(true);
      setNewMessageCount(0);
      return;
    }

    if (!mountedRef.current) {
      mountedRef.current = true;
      visibleItemCountRef.current = visibleItemCount;
      return;
    }

    const previousVisibleItemCount = visibleItemCountRef.current;
    visibleItemCountRef.current = visibleItemCount;

    if (!userWasAtBottomRef.current && !userJustSentRef.current) {
      setNewMessageCount((n) =>
        nextNewMessageCount(
          n,
          previousVisibleItemCount,
          visibleItemCount,
          currentItemUpdated,
        ),
      );
      return;
    }

    const id = setTimeout(() => {
      scrollContainerToBottom('smooth');
      userJustSentRef.current = false;
      userWasAtBottomRef.current = true;
      if (!prevAtBottomRef.current) {
        prevAtBottomRef.current = true;
        setIsAtBottom(true);
      }
    }, 0);
    return () => clearTimeout(id);
  }, [
    whenToScroll,
    visibleItemCount,
    resetKey,
    currentItemUpdated,
    scrollContainerToBottom,
  ]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    const previous = viewportSize.current;
    // A resize can dispatch scroll before ResizeObserver. Preserve the old pin
    // decision until the observer has applied the new viewport dimensions.
    if (
      el &&
      previous &&
      (previous.width !== el.clientWidth || previous.height !== el.clientHeight)
    )
      return;
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
