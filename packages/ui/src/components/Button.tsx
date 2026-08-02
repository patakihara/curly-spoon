/**
 * M3 Expressive button. Five emphasis variants (filled > tonal > elevated > outlined >
 * text) and three sizes. Pressing morphs the corner radius from `full` toward `md`
 * along `spring.bouncy` (docs/DESIGN.md § Shape) instead of scaling — the shape change
 * *is* the press feedback, on top of the usual state layer.
 */
import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import './Button.css';

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner in place of the leading icon and suppresses interaction. */
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'filled',
    size = 'md',
    loading = false,
    disabled = false,
    leadingIcon,
    trailingIcon,
    children,
    className,
    ...rest
  },
  ref,
) {
  const spinnerId = useId();
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type="button"
      className={clsx(
        'm3-button',
        `m3-button--${variant}`,
        `m3-button--${size}`,
        'm3-state-layer',
        className,
      )}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-describedby={loading ? spinnerId : undefined}
      {...rest}
    >
      {loading ? (
        <span className="m3-button__spinner" aria-hidden="true" />
      ) : leadingIcon ? (
        <span className="m3-button__icon m3-button__icon--leading">{leadingIcon}</span>
      ) : null}
      {loading ? (
        <span id={spinnerId} className="m3-visually-hidden">
          Loading
        </span>
      ) : null}
      {children ? <span className="m3-button__label">{children}</span> : null}
      {!loading && trailingIcon ? (
        <span className="m3-button__icon m3-button__icon--trailing">{trailingIcon}</span>
      ) : null}
    </button>
  );
});
