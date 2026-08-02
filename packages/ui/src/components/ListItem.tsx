/**
 * M3 list item — the workhorse of every browse/queue/downloads screen. Supports
 * 1/2/3-line layouts and optional leading/trailing slots (art, icons, a switch, etc).
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import './ListItem.css';

export interface ListItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  headline: ReactNode;
  /** Second line of text. Presence implies a 2-line layout (or 3, with `supportingText`). */
  overline?: ReactNode;
  supportingText?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  /** Renders a non-interactive `<div>` row instead of a `<button>` (e.g. a static row). */
  interactive?: boolean;
}

export const ListItem = forwardRef<HTMLButtonElement, ListItemProps>(function ListItem(
  {
    headline,
    overline,
    supportingText,
    leading,
    trailing,
    selected = false,
    interactive = true,
    className,
    ...rest
  },
  ref,
) {
  const lines = 1 + (overline ? 1 : 0) + (supportingText ? 1 : 0);
  const content = (
    <>
      {leading ? <span className="m3-list-item__leading">{leading}</span> : null}
      <span className="m3-list-item__text">
        {overline ? <span className="m3-list-item__overline">{overline}</span> : null}
        <span className="m3-list-item__headline">{headline}</span>
        {supportingText ? <span className="m3-list-item__supporting">{supportingText}</span> : null}
      </span>
      {trailing ? <span className="m3-list-item__trailing">{trailing}</span> : null}
    </>
  );

  const classes = clsx(
    'm3-list-item',
    `m3-list-item--lines-${lines}`,
    selected && 'm3-list-item--selected',
    interactive && 'm3-state-layer',
    className,
  );

  if (!interactive) {
    return (
      <div className={classes} aria-current={selected ? 'true' : undefined}>
        {content}
      </div>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      aria-current={selected ? 'true' : undefined}
      {...rest}
    >
      {content}
    </button>
  );
});
