/**
 * Top app bar. `large` starts tall (title below the action row, M3 Expressive scale)
 * and collapses to `small`'s compact height as the associated scroll container scrolls
 * past a small threshold — handing the header back the space it took from content.
 *
 * Mantine-backed (docs/HANDOVER.md): `AppShell` + `AppShell.Header`, mirroring
 * Shell.tsx's inline desktop rail (`AppShell` + `AppShell.Navbar`). `mode="static"`
 * for the same reason as there: Mantine's default `fixed` mode would
 * `position:fixed` the header to the viewport instead of to this component's own
 * host/scroll container, which would break the large->small collapse this
 * component drives itself via `scrollContainerRef`. `header={{ height: 'auto' }}`:
 * this component's whole job is a height that *changes* (small/large/collapsed),
 * so a fixed pixel height in the AppShell config would fight the CSS that
 * actually sizes it (`.m3-top-app-bar--*`) — `'auto'` hands sizing back to
 * content, same as `padding={0}` on the outer AppShell.
 */
import { forwardRef, useEffect, useState, type ReactNode, type RefObject } from 'react';
import clsx from 'clsx';
import { AppShell } from '@mantine/core';
import './TopAppBar.css';

export type TopAppBarVariant = 'small' | 'large';

export interface TopAppBarProps {
  variant?: TopAppBarVariant;
  title: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  /** The scrollable element that drives large -> small collapsing. Defaults to `window`. */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  className?: string;
}

const COLLAPSE_THRESHOLD_PX = 32;

export const TopAppBar = forwardRef<HTMLElement, TopAppBarProps>(function TopAppBar(
  { variant = 'small', title, leading, actions, scrollContainerRef, className },
  ref,
) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (variant !== 'large') return;
    const target: HTMLElement | Window = scrollContainerRef?.current ?? window;

    const read = () =>
      target instanceof Window ? window.scrollY : (target as HTMLElement).scrollTop;

    const handleScroll = () => setCollapsed(read() > COLLAPSE_THRESHOLD_PX);
    handleScroll();
    target.addEventListener('scroll', handleScroll, { passive: true });
    return () => target.removeEventListener('scroll', handleScroll);
  }, [variant, scrollContainerRef]);

  const isLarge = variant === 'large' && !collapsed;

  return (
    <AppShell header={{ height: 'auto' }} mode="static" padding={0}>
      <AppShell.Header
        ref={ref}
        className={clsx(
          'm3-top-app-bar',
          `m3-top-app-bar--${variant}`,
          isLarge && 'm3-top-app-bar--expanded',
          className,
        )}
      >
        <div className="m3-top-app-bar__row">
          {leading ? <div className="m3-top-app-bar__leading">{leading}</div> : null}
          {!isLarge ? <h1 className="m3-top-app-bar__title">{title}</h1> : null}
          {actions ? <div className="m3-top-app-bar__actions">{actions}</div> : null}
        </div>
        {isLarge ? (
          <h1 className="m3-top-app-bar__title m3-top-app-bar__title--large">{title}</h1>
        ) : null}
      </AppShell.Header>
    </AppShell>
  );
});
