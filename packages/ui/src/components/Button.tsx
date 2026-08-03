/**
 * M3 Expressive button, now a thin wrapper around Mantine's `Button`. Five emphasis
 * variants (filled > tonal > elevated > outlined > text) and three sizes map onto
 * Mantine's own `variant`/`size` props — `elevated` has no direct Mantine equivalent,
 * so it rides Mantine's `default` variant plus an explicit box-shadow, matching the
 * old M3 "surface + elevation" look (docs/DESIGN.md § Elevation) rather than a flat
 * colour swap.
 *
 * `text` also gets a style override (`color: var(--m3-primary)`), verified empirically
 * against a live render: Mantine's `subtle` variant defaults to text colour drawn from
 * `theme.colors.auralis`'s shade-2 stop, which our tone-based ramp (`mantineColors.ts`)
 * makes a near-white pastel at every hue — fine paired with `subtle`'s own dark-mode
 * background assumption, but `subtle`/`text` renders on transparent, so it inherits
 * whatever real surface it sits on. `var(--m3-primary)` is the token every other
 * primary-coloured accent in this app already resolves against that surface, so it
 * stays legible in both modes without depending on Mantine's colour-ramp guess.
 *
 * `loading` is Mantine's own built-in loader overlay (it also implicitly disables the
 * button), and `leadingIcon`/`trailingIcon` map to Mantine's `leftSection`/`rightSection`
 * — kept under their original M3 names here since that's this package's public API.
 */
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { Button as MantineButtonPrimitive, type ButtonVariant as MantineButtonVariant } from '@mantine/core';
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

/** M3 variant name -> Mantine `Button` variant. `elevated`/`text` also get a style override below. */
const VARIANT_MAP: Record<ButtonVariant, MantineButtonVariant> = {
  filled: 'filled',
  tonal: 'light',
  outlined: 'outline',
  text: 'subtle',
  elevated: 'default',
};

const VARIANT_STYLE_OVERRIDE: Partial<Record<ButtonVariant, CSSProperties>> = {
  elevated: {
    backgroundColor: 'var(--m3-surface-container-low)',
    color: 'var(--m3-primary)',
    boxShadow: 'var(--m3-elevation-1, 0 1px 3px rgba(0, 0, 0, 0.3))',
  },
  text: {
    color: 'var(--m3-primary)',
  },
};

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
    style,
    ...rest
  },
  ref,
) {
  return (
    <MantineButtonPrimitive
      ref={ref}
      type="button"
      variant={VARIANT_MAP[variant]}
      size={size}
      loading={loading}
      disabled={disabled}
      leftSection={leadingIcon}
      rightSection={trailingIcon}
      className={className}
      style={{ ...VARIANT_STYLE_OVERRIDE[variant], ...style }}
      {...rest}
    >
      {children}
    </MantineButtonPrimitive>
  );
});
