/**
 * Icon button, a thin wrapper around Mantine's `ActionIcon`. `toggle` mode (e.g.
 * shuffle, like) is still driven by `selected`/`onSelectedChange` — Mantine has no
 * built-in toggle concept, so that logic (and the `aria-pressed` it implies) stays here,
 * on top of `ActionIcon`.
 *
 * Variant/colour mapping: `filled`/`tonal` still ride Mantine's own `theme.colors.auralis`
 * ramp (`ThemeProvider.tsx`, out of scope for wave 16c-1) — that infrastructure is
 * unchanged. `standard`/`outlined` are visually neutral (they only turn accent-coloured
 * when *selected*) — for the neutral state that's Mantine's own `gray`; the *selected*
 * colour is an explicit style override, moved in this wave from `var(--m3-primary)` onto
 * Sonora's `var(--accent-ink, var(--accent))` (docs/design/SONORA.md §2 names
 * `--accent-ink` as the token every "active/selected" indicator should use — `RailItem`'s
 * own active-nav treatment is the closest vendored precedent).
 *
 * **Portal fallback, deliberate** — same reasoning as Button.tsx: `--accent-ink` has no
 * `:root` fallback (see `packages/ui/src/styles/sonora-theme.css`'s header), so a
 * *selected* `standard` IconButton rendered inside `Dialog`/`Sheet`/`Menu` would silently
 * lose its accent colour without the `var(--accent-ink, var(--accent))` fallback chain —
 * `--accent` itself is always `:root`-scoped and never resolves empty.
 */
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { ActionIcon, type ActionIconVariant, type MantineColor } from '@mantine/core';
import { TOUCH_TARGET_MIN } from '../tokens/spacing.js';
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

/** M3 variant (+ selected state) -> Mantine `ActionIcon` variant/color/style. */
function resolveMantineProps(
  variant: IconButtonVariant,
  selected: boolean | undefined,
): { variant: ActionIconVariant; color?: MantineColor; style?: CSSProperties } {
  switch (variant) {
    case 'filled':
      return { variant: 'filled' };
    case 'tonal':
      return { variant: 'light' };
    case 'outlined':
      // M3's outlined-selected state swaps to an inverse (dark) fill — approximated
      // here with Mantine's own `filled` + `dark`, rather than `gray`'s outline.
      return selected
        ? { variant: 'filled', color: 'dark' }
        : { variant: 'outline', color: 'gray' };
    case 'standard':
    default:
      // Unselected "standard" is neutral; selected turns accent-coloured, matching
      // the old `:not(.selected) { color: on-surface-variant }`.
      return selected
        ? { variant: 'subtle', style: { color: 'var(--accent-ink, var(--accent))' } }
        : { variant: 'subtle', color: 'gray' };
  }
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    variant = 'standard',
    selected,
    onSelectedChange,
    onClick,
    disabled,
    className,
    style,
    children,
    ...rest
  },
  ref,
) {
  const isToggle = selected !== undefined;
  const {
    variant: mantineVariant,
    color,
    style: variantStyle,
  } = resolveMantineProps(variant, selected);

  return (
    <ActionIcon
      ref={ref}
      type="button"
      size={TOUCH_TARGET_MIN}
      variant={mantineVariant}
      color={color}
      disabled={disabled}
      className={className}
      style={{ ...variantStyle, ...style }}
      aria-pressed={isToggle ? selected : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (isToggle) onSelectedChange?.(!selected);
      }}
      {...rest}
    >
      <span className="m3-icon-button__glyph">{children}</span>
    </ActionIcon>
  );
});
