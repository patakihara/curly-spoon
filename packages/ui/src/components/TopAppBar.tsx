/**
 * Top app bar. `large` starts tall (title below the action row, M3 Expressive scale)
 * and collapses to `small`'s compact height as the associated scroll container scrolls
 * past a small threshold — handing the header back the space it took from content.
 */
import { forwardRef, useEffect, useState, type ReactNode, type RefObject } from 'react';
import clsx from 'clsx';
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
    <header
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
    </header>
  );
});
