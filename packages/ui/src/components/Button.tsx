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
 * tokens. The pill radius (`--radius-pill`, Button.css) replaces the old M3-Expressive
 * shape-morph — see that file's comment for why the morph itself is dropped, not just
 * re-tokened.
 *
 * **Reconciled against Sonora's own vendored `Button.jsx`** (`docs/design/sonora/
 * primitives/`, landed after this wave's spec was written — `docs/design/SONORA.md` §4 had
 * only the prop *names*, mined from a lint config, not the real values). Two corrections
 * this made, both worth recording because the first draft got them wrong by inference:
 *
 * 1. **`--accent-ink` appears nowhere in any of the five real primitives** — every accent
 *    reference in Sonora's own source is the raw `--accent`, including where SONORA.md §2's
 *    prose explicitly recommends `--accent-ink` ("for anything that must be readable on a
 *    surface"). More specifically: Sonora's real `ghost`/`secondary` variants (the closest
 *    analogues to this component's `text`/`elevated`) use plain `var(--surface-fg)` for
 *    text — **not an accent colour at all** — reserving `--accent` for `primary`'s solid
 *    fill only. `text`/`elevated` below follow that: plain surface foreground, not accent.
 *    This also makes the WCAG AA risk the first draft carried (`--accent-ink` on
 *    `--surface-card` measuring ~4.35:1, just under the 4.5:1 text threshold) moot for this
 *    component — see the wave report for where the same risk still applies (`Chip`, which
 *    *does* use `--accent`/`--accent-contrast` in the real source).
 * 2. **The real `Button.jsx` uses `--radius-pill` at every size** (confirmed, not inferred)
 *    — validates the shape-morph-removal decision already made in Button.css.
 *
 * **Portal fallback, deliberate, and empirically checked both ways.** `--surface-fg`/
 * `--surface-card` are scoped to `.auralis-theme-root[data-theme]` with no `:root` fallback
 * (see `packages/ui/src/styles/sonora-theme.css`'s header) — a Button rendered inside
 * `Dialog`/`Sheet`/`Menu` (all three portal outside that root and are excluded from this
 * wave) loses this styling unless the fallback picks up the slack. Two things were actually
 * measured, not assumed:
 * 1. Inside `DialogGallery`, `getComputedStyle(dialogCancelEl).getPropertyValue('--surface-fg')`
 *    returns the empty string — the property genuinely does not resolve there, so the
 *    fallback path is live, not theoretical.
 * 2. A *literal* fallback commits to one theme and is wrong in the other: swapping `text`'s
 *    colour fallback to the dark-mode literal (`rgb(225, 225, 225)`) and running
 *    `e2e/ui/button.spec.ts`'s "stays legible in light mode" test against it fails the
 *    distance assertion (Mantine's light Modal background is a light near-white, so a
 *    light-literal text colour collapses toward it) — confirming the failure mode the
 *    `currentColor` fallback exists to avoid, not merely asserting it.
 *
 * So `color: var(--surface-fg, currentColor)` inherits whatever colour the portal's own
 * ancestor (Mantine's Modal, correctly theme-aware) already set, rather than committing to
 * one theme's literal. `backgroundColor`/`boxShadow` keep static literal fallbacks — a
 * wrong-theme background is off-theme but still legible, which is a lower-severity failure
 * than wrong-theme text, so it's noted rather than chased (see the wave report). One
 * residual risk from this same fallback pair: no gallery `Dialog` contains an `elevated`
 * button, so `backgroundColor: var(--surface-card, rgb(20, 20, 20))` paired with
 * `color: currentColor` is untested inside a portal — if a future caller puts an `elevated`
 * button in a `Dialog`, and the portal's inherited text colour is dark-mode-light while the
 * background literal is the dark-mode-near-black, that pairing could read as low-contrast.
 * Not exercised by any current caller (checked by grep); flagged for the next one that adds it.
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
    color: 'var(--surface-fg, currentColor)',
    boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.1))',
  },
  text: {
    color: 'var(--surface-fg, currentColor)',
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
