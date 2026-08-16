/**
 * Button, a thin wrapper around Mantine's `Button`. Five emphasis variants
 * (filled > tonal > elevated > outlined > text) and three sizes map onto Mantine's own
 * `variant`/`size` props — `elevated` has no direct Mantine equivalent, so it rides
 * Mantine's `default` variant plus an explicit surface + shadow.
 *
 * Wave 16c-1 (docs/ROADMAP.md §16): `filled`/`tonal`/`outlined` still ride Mantine's own
 * `theme.colors.auralis` ramp (`ThemeProvider.tsx`, out of scope for this wave) — only the
 * two variants that already carried an explicit style override (`elevated`, `text`) move
 * here, from `--m3-primary`/`--m3-surface-container-low`/`--m3-elevation-1` onto Sonora's
 * `--accent-ink`/`--surface-card`/`--shadow-sm` (docs/design/SONORA.md §1, §2). The pill
 * radius (`--radius-pill`, Button.css) replaces the old M3-Expressive shape-morph — see
 * that file's comment for why the morph itself is dropped, not just re-tokened.
 *
 * **Portal fallback, deliberate.** `--accent-ink` and `--surface-card` are scoped to
 * `.auralis-theme-root[data-theme]` with no `:root` fallback (see
 * `packages/ui/src/styles/sonora-theme.css`'s header) — a Button rendered inside
 * `Dialog`/`Sheet`/`Menu` (all three portal outside that root and are excluded from this
 * wave) would otherwise silently lose this styling (inherited text colour, transparent
 * background). `var(--accent-ink, var(--accent))` falls back to the always-`:root`-scoped
 * raw accent, which never resolves empty; the surface/shadow values below fall back to
 * static, dark-leaning literals for the same reason. This is a mitigation, not a fix —
 * see the wave report for the real gap (Dialog/Sheet/Menu themselves need re-parenting or
 * re-emission, and that is a later wave's work).
 *
 * `text`'s `color: var(--accent-ink, ...)` is a genuine WCAG AA risk for the default
 * violet accent even inside `.auralis-theme-root`: `--accent-ink` in dark mode is
 * literally `var(--accent)` with no adjustment, and #8b5cf6 on `--surface-card` measures
 * ~4.35:1 — just under the 4.5:1 text threshold (comfortably over the 3:1 large-text/
 * UI-component one). Sonora-faithful, not silently changed to something that passes —
 * see the wave report.
 *
 * `loading` is Mantine's own built-in loader overlay (it also implicitly disables the
 * button), and `leadingIcon`/`trailingIcon` map to Mantine's `leftSection`/`rightSection`
 * — kept under their original M3 names here since that's this package's public API.
 */
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import {
  Button as MantineButtonPrimitive,
  type ButtonVariant as MantineButtonVariant,
} from '@mantine/core';
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
    backgroundColor: 'var(--surface-card, rgb(20, 20, 20))',
    color: 'var(--accent-ink, var(--accent))',
    boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.1))',
  },
  text: {
    color: 'var(--accent-ink, var(--accent))',
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
      aria-busy={loading}
      leftSection={leadingIcon}
      rightSection={trailingIcon}
      data-m3-size={size}
      className={['m3-button', className].filter(Boolean).join(' ')}
      style={{ ...VARIANT_STYLE_OVERRIDE[variant], ...style }}
      {...rest}
    >
      {children}
    </MantineButtonPrimitive>
  );
});
