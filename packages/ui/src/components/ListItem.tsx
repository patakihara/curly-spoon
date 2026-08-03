/**
 * M3 list item — the workhorse of every browse/queue/downloads screen. Supports
 * 1/2/3-line layouts and optional leading/trailing slots (art, icons, a switch, etc).
 *
 * Built on Mantine's `UnstyledButton` (interactive) and `Box` (static row) rather
 * than Mantine's `NavLink`: `NavLink` hardcodes `component="a"` internally, has no
 * slot for a 3-line `overline` layout, and its fixed label/description/section
 * structure doesn't match this component's existing custom markup — `UnstyledButton`
 * is itself the primitive `NavLink` is built on (bare polymorphic button, zero
 * built-in visual opinions), which is exactly the "give me accessible interactive
 * semantics, I'll supply the markup and CSS" fit this component needs. All visuals
 * still come from `.m3-list-item*` (ListItem.css), unchanged.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Box, UnstyledButton } from '@mantine/core';
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
      <Box className={classes} aria-current={selected ? 'true' : undefined}>
        {content}
      </Box>
    );
  }

  return (
    <UnstyledButton
      ref={ref}
      type="button"
      className={classes}
      aria-current={selected ? 'true' : undefined}
      {...rest}
    >
      {content}
    </UnstyledButton>
  );
});
