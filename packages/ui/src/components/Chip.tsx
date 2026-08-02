/**
 * M3 chip. `filter` chips are two-state toggles (`aria-pressed`); `input` chips carry
 * their own remove control; `assist` chips are plain action buttons.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Icon } from './Icon.js';
import './Chip.css';

export type ChipVariant = 'assist' | 'filter' | 'input';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ChipVariant;
  /** Only meaningful for `filter` chips. */
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  icon?: ReactNode;
  /** Only meaningful for `input` chips — renders a trailing remove control. */
  onRemove?: () => void;
  children: ReactNode;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { variant = 'assist', selected, onSelectedChange, icon, onRemove, onClick, className, children, ...rest },
  ref,
) {
  const isFilter = variant === 'filter';

  return (
    <span className={clsx('m3-chip-wrapper', className)}>
      <button
        ref={ref}
        type="button"
        className={clsx(
          'm3-chip',
          `m3-chip--${variant}`,
          isFilter && selected && 'm3-chip--selected',
          'm3-state-layer',
        )}
        aria-pressed={isFilter ? Boolean(selected) : undefined}
        onClick={(event) => {
          onClick?.(event);
          if (isFilter) onSelectedChange?.(!selected);
        }}
        {...rest}
      >
        {isFilter && selected ? (
          <Icon name="check" className="m3-chip__icon" />
        ) : icon ? (
          <span className="m3-chip__icon">{icon}</span>
        ) : null}
        <span className="m3-chip__label">{children}</span>
      </button>
      {variant === 'input' && onRemove ? (
        <button
          type="button"
          className="m3-chip__remove m3-hit-slop"
          aria-label="Remove"
          onClick={onRemove}
        >
          <Icon name="close" />
        </button>
      ) : null}
    </span>
  );
});
