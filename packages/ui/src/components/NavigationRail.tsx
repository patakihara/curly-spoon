/**
 * Side navigation for medium (600-1240px, collapsed) and expanded (>1240px) layouts —
 * shares the exact item model and active-indicator mechanism `NavigationBar` uses, per
 * docs/DESIGN.md § Layout.
 */
import { forwardRef, useRef } from 'react';
import clsx from 'clsx';
import type { NavigationSharedProps } from './navigationTypes.js';
import { useActiveIndicator } from '../internal/useActiveIndicator.js';
import './NavigationRail.css';

export interface NavigationRailProps extends NavigationSharedProps {
  /** Collapsed shows icons only; expanded (>1240px) adds labels beside them. */
  expanded?: boolean;
}

export const NavigationRail = forwardRef<HTMLElement, NavigationRailProps>(function NavigationRail(
  { items, activeKey, onActiveChange, expanded = false, 'aria-label': ariaLabel = 'Primary' },
  forwardedRef,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const indicator = useActiveIndicator(containerRef, itemRefs, activeKey);

  return (
    <nav
      ref={forwardedRef}
      className={clsx('m3-nav-rail', expanded && 'm3-nav-rail--expanded')}
      aria-label={ariaLabel}
    >
      <div className="m3-nav-rail__items" ref={containerRef}>
        {indicator ? (
          <span
            className="m3-nav-rail__indicator"
            style={{
              transform: `translateY(${indicator.top}px)`,
              height: indicator.height,
            }}
            aria-hidden="true"
          />
        ) : null}
        {items.map((item) => {
          const selected = item.key === activeKey;
          return (
            <button
              key={item.key}
              ref={(el) => {
                if (el) itemRefs.current.set(item.key, el);
                else itemRefs.current.delete(item.key);
              }}
              type="button"
              className={clsx(
                'm3-nav-rail__item',
                'm3-state-layer',
                selected && 'm3-nav-rail__item--active',
              )}
              aria-current={selected ? 'page' : undefined}
              onClick={() => onActiveChange(item.key)}
            >
              <span className="m3-nav-rail__icon">{item.icon}</span>
              <span className="m3-nav-rail__label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});
