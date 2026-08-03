/**
 * M3-flavoured chip — thin wrapper around Mantine's `Chip` (itself a styled
 * checkbox pill) plus `CloseButton` for the `input` variant's remove control.
 *
 * Only `filter` chips are genuinely two-state here — `assist`/`input` chips are
 * single-shot action chips, not toggles. Mantine's `Chip` is fundamentally a
 * checkbox, so for `assist`/`input` it's pinned fully controlled at
 * `checked={false}` (an inert `onChange` keeps React from warning about a
 * controlled input with no change handler) and the wrapper's own `onClick` does
 * the real work — same as the original hand-rolled button's "always fire
 * `onClick`, only flip selection for filter chips" behaviour.
 *
 * Note this changes the chip's interactive DOM element from a `<button>` to an
 * `<input type="checkbox">` (Mantine's own choice, not overridable) — anything
 * that queried a `<button>` inside a chip (e.g. `aria-pressed` toggling) now needs
 * to target the input instead.
 *
 * `icon` is rendered as a plain leading `<span>` inside the label, not via
 * Mantine's own `icon` prop: that prop's slot only paints while `checked`, which
 * is permanently `false` for `assist`/`input` chips — passing a custom icon
 * through it would silently never render (confirmed against the gallery's
 * `chip-assist` case). The one exception is a *selected* `filter` chip, which
 * still uses Mantine's own default check glyph (by passing no `icon` at all),
 * matching the original "selected filter chips always show a checkmark,
 * ignoring any custom icon" behaviour.
 */
import { forwardRef, type ReactNode } from 'react';
import clsx from 'clsx';
import { Chip as MantineChip, CloseButton } from '@mantine/core';

export type ChipVariant = 'assist' | 'filter' | 'input';

export interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ChipVariant;
  /** Only meaningful for `filter` chips. */
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  icon?: ReactNode;
  /** Only meaningful for `input` chips — renders a trailing remove control. */
  onRemove?: () => void;
  /** Applied to the wrapper (the chip's public root), not the inner control. */
  'data-testid'?: string;
  children: ReactNode;
}

export const Chip = forwardRef<HTMLInputElement, ChipProps>(function Chip(
  {
    variant = 'assist',
    selected,
    onSelectedChange,
    icon,
    onRemove,
    onClick,
    className,
    children,
    'data-testid': dataTestId,
    id,
    type: _type,
    onChange: _onChange,
    ...rest
  },
  ref,
) {
  const isFilter = variant === 'filter';
  const showsCheckGlyph = isFilter && Boolean(selected);

  return (
    <span className={clsx('m3-chip-wrapper', className)} data-testid={dataTestId} id={id}>
      <MantineChip
        ref={ref}
        variant={showsCheckGlyph ? 'filled' : 'outline'}
        checked={isFilter ? Boolean(selected) : false}
        onChange={(checked) => {
          if (isFilter) onSelectedChange?.(checked);
        }}
        onClick={(event) => {
          onClick?.(event as unknown as React.MouseEvent<HTMLButtonElement>);
        }}
        // `rest` is typed against `ButtonHTMLAttributes<HTMLButtonElement>` (the
        // public `ChipProps` shape), but every event handler in it now feeds an
        // `<input>`, not a `<button>` — genuinely incompatible generics (e.g.
        // `onFocus: (e: FocusEvent<HTMLButtonElement>) => void` isn't assignable to
        // a slot expecting `FocusEvent<HTMLInputElement>`), not a real runtime
        // hazard: both interfaces expose the same DOM properties these handlers
        // actually read. No current caller passes anything here beyond what's
        // already destructured above.
        {...(rest as Record<string, unknown>)}
      >
        {!showsCheckGlyph && icon ? <span className="m3-chip__icon-inline">{icon}</span> : null}
        {children}
      </MantineChip>
      {variant === 'input' && onRemove ? (
        <CloseButton size="xs" aria-label="Remove" onClick={onRemove} />
      ) : null}
    </span>
  );
});
