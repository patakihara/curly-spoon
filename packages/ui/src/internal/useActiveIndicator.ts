import { useLayoutEffect, useState, type RefObject } from 'react';

export interface IndicatorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Tracks the on-screen rect of whichever navigation item is active, relative to its
 * container, so callers can position an absolutely-positioned "active indicator" pill
 * with a CSS transition and get it to spring smoothly between items — the same
 * mechanism `NavigationBar` and `NavigationRail` both use (docs/DESIGN.md: "shared item
 * model" — this hook is the shared part).
 */
export function useActiveIndicator(
  containerRef: RefObject<HTMLElement | null>,
  itemRefs: RefObject<Map<string, HTMLElement>>,
  activeKey: string,
): IndicatorRect | null {
  const [rect, setRect] = useState<IndicatorRect | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const item = itemRefs.current?.get(activeKey);
    if (!container || !item) {
      setRect(null);
      return;
    }

    const update = () => {
      const containerBox = container.getBoundingClientRect();
      const itemBox = item.getBoundingClientRect();
      setRect({
        left: itemBox.left - containerBox.left,
        top: itemBox.top - containerBox.top,
        width: itemBox.width,
        height: itemBox.height,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(item);
    return () => observer.disconnect();
  }, [containerRef, itemRefs, activeKey]);

  return rect;
}
