/**
 * M3 icon button. `toggle` mode (e.g. shuffle, like) springs between selected/unselected
 * fill states along `spring.fast` (docs/DESIGN.md: "Icon toggles ... spring.fast").
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import './IconButton.css';

export type IconButtonVariant = 'standard' | 'filled' | 'tonal' | 'outlined';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: IconButtonVariant;
  /** Accessible name — required, since the button's only visible content is a glyph. */
  'aria-label': string;
  /** When set, the button behaves as a two-state toggle (`aria-pressed`). */
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    variant = 'standard',
    selected,
    onSelectedChange,
    onClick,
    disabled,
    className,
    children,
    ...rest
  },
  ref,
) {
  const isToggle = selected !== undefined;

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={clsx(
        'm3-icon-button',
        `m3-icon-button--${variant}`,
        isToggle && 'm3-icon-button--toggle',
        selected && 'm3-icon-button--selected',
        'm3-state-layer',
        className,
      )}
      aria-pressed={isToggle ? selected : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (isToggle) onSelectedChange?.(!selected);
      }}
      {...rest}
    >
      <span className="m3-icon-button__glyph">{children}</span>
    </button>
  );
});
