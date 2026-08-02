/**
 * Bottom navigation for narrow (<600px) layouts — icon-only-first destination
 * switching, with an active-indicator pill that springs between items rather than
 * appearing/disappearing (docs/DESIGN.md § Layout, § Motion).
 */
import { forwardRef, useRef } from 'react';
import clsx from 'clsx';
import type { NavigationSharedProps } from './navigationTypes.js';
import { useActiveIndicator } from '../internal/useActiveIndicator.js';
import './NavigationBar.css';

export type { NavigationItem } from './navigationTypes.js';

export const NavigationBar = forwardRef<HTMLElement, NavigationSharedProps>(function NavigationBar(
  { items, activeKey, onActiveChange, 'aria-label': ariaLabel = 'Primary' },
  forwardedRef,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const indicator = useActiveIndicator(containerRef, itemRefs, activeKey);

  return (
    <nav ref={forwardedRef} className="m3-nav-bar" aria-label={ariaLabel}>
      <div className="m3-nav-bar__items" ref={containerRef}>
        {indicator ? (
          <span
            className="m3-nav-bar__indicator"
            style={{
              transform: `translateX(${indicator.left}px)`,
              width: indicator.width,
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
              className={clsx('m3-nav-bar__item', 'm3-state-layer', selected && 'm3-nav-bar__item--active')}
              aria-current={selected ? 'page' : undefined}
              onClick={() => onActiveChange(item.key)}
            >
              <span className="m3-nav-bar__icon">{item.icon}</span>
              <span className="m3-nav-bar__label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});
