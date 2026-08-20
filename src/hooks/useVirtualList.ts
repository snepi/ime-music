import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Lightweight windowed list: only mount rows near the scroll viewport.
 * Avoids pulling in react-window for the library song list.
 */
export function useVirtualList<T>({
  items,
  rowHeight,
  overscan = 12,
  enabled = true,
}: {
  items: T[];
  rowHeight: number;
  overscan?: number;
  enabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return undefined;

    const onScroll = () => setScrollTop(el.scrollTop);
    const updateSize = () => setViewportHeight(el.clientHeight || 600);

    onScroll();
    updateSize();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null;
    ro?.observe(el);
    window.addEventListener('resize', updateSize);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [enabled, items.length]);

  const range = useMemo(() => {
    if (!enabled || items.length === 0) {
      return { start: 0, end: items.length, offsetY: 0, totalHeight: items.length * rowHeight };
    }
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    const end = Math.min(items.length, start + visibleCount);
    return {
      start,
      end,
      offsetY: start * rowHeight,
      totalHeight: items.length * rowHeight,
    };
  }, [enabled, items.length, overscan, rowHeight, scrollTop, viewportHeight]);

  const visibleItems = useMemo(
    () => (enabled ? items.slice(range.start, range.end) : items),
    [enabled, items, range.end, range.start],
  );

  return {
    containerRef,
    visibleItems,
    startIndex: enabled ? range.start : 0,
    offsetY: enabled ? range.offsetY : 0,
    totalHeight: enabled ? range.totalHeight : undefined,
    virtualized: enabled,
  };
}
