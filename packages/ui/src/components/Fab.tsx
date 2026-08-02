/**
 * Floating action button. `sm`/`md`/`lg` are square; `extended` adds a text label and
 * becomes pill-shaped. Uses the same shape-morph-on-press language as `Button`.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import './Fab.css';

export type FabSize = 'sm' | 'md' | 'lg';

export interface FabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  size?: FabSize;
  /** Renders a pill-shaped extended FAB with a visible label instead of icon-only. */
  extended?: boolean;
  icon: ReactNode;
  /** Required when `extended` is false, since the FAB then has no visible text. */
  label?: ReactNode;
  'aria-label'?: string;
}

export const Fab = forwardRef<HTMLButtonElement, FabProps>(function Fab(
  { size = 'md', extended = false, icon, label, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={clsx(
        'm3-fab',
        `m3-fab--${size}`,
        extended && 'm3-fab--extended',
        'm3-state-layer',
        className,
      )}
      {...rest}
    >
      <span className="m3-fab__icon">{icon}</span>
      {extended && label ? <span className="m3-fab__label">{label}</span> : null}
    </button>
  );
});
