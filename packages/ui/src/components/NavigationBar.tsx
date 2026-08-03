/**
 * Bottom navigation for narrow (<600px) layouts — icon-only-first destination
 * switching, with an active-indicator pill that springs between items rather than
 * appearing/disappearing (docs/DESIGN.md § Layout, § Motion).
 *
 * Mantine-backed (docs/HANDOVER.md): `AppShell` + `AppShell.Footer` is the
 * structural container, mirroring Shell.tsx's inline desktop rail (`AppShell` +
 * `AppShell.Navbar`). `mode="static"` for the same reason as there: this bar is
 * just another flex/block child of whatever layout hosts it, not
 * `position:fixed` to the viewport the way Mantine's default `fixed` mode would
 * pin it. `component="nav"` on `AppShell.Footer` (whose own default element is
 * `<footer>`) restores the `<nav aria-label>` landmark the original element had.
 *
 * Each destination renders as a Mantine `UnstyledButton`, not `NavLink`:
 * `NavLink` lays `leftSection` beside `label` (a rail shape), but this bar
 * needs icon-above-label per tab, which the existing `.m3-nav-bar__item` CSS
 * already provides — `UnstyledButton` takes that styling with no Mantine-imposed
 * layout to fight. The active-indicator pill (`useActiveIndicator`) is
 * unchanged: it's orthogonal to which primitive renders each item, and
 * `e2e/ui/navigation.spec.ts` still asserts it springs between items.
 */
import { forwardRef, useRef } from 'react';
import clsx from 'clsx';
import { AppShell, UnstyledButton } from '@mantine/core';
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
    <AppShell footer={{ height: 'auto' }} mode="static" padding={0}>
      <AppShell.Footer
        ref={forwardedRef}
        component="nav"
        className="m3-nav-bar"
        aria-label={ariaLabel}
      >
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
              <UnstyledButton
                key={item.key}
                ref={(el: HTMLButtonElement | null) => {
                  if (el) itemRefs.current.set(item.key, el);
                  else itemRefs.current.delete(item.key);
                }}
                type="button"
                className={clsx(
                  'm3-nav-bar__item',
                  'm3-state-layer',
                  selected && 'm3-nav-bar__item--active',
                )}
                aria-current={selected ? 'page' : undefined}
                onClick={() => onActiveChange(item.key)}
              >
                <span className="m3-nav-bar__icon">{item.icon}</span>
                <span className="m3-nav-bar__label">{item.label}</span>
              </UnstyledButton>
            );
          })}
        </div>
      </AppShell.Footer>
    </AppShell>
  );
});
