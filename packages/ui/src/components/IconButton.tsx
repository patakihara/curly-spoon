/**
 * M3 icon button, now a thin wrapper around Mantine's `ActionIcon`. `toggle` mode
 * (e.g. shuffle, like) is still driven by `selected`/`onSelectedChange` — Mantine has
 * no built-in toggle concept, so that logic (and the `aria-pressed` it implies) stays
 * here, on top of `ActionIcon`.
 *
 * Variant/colour mapping: `filled`/`tonal` already read as the M3 primary colour for
 * free, since the theme's `primaryColor` is the artwork-derived `auralis` ramp
 * (see `ThemeProvider.tsx`). `standard`/`outlined` are visually neutral in M3 (they
 * only turn primary-coloured when *selected*) — for the neutral state that's Mantine's
 * own `gray`, but the *selected* accent colour is applied as an explicit
 * `color: var(--m3-primary)` style override rather than Mantine's default theme
 * colour: verified empirically (see Button.tsx's `text` variant for the same issue),
 * Mantine's `subtle` variant resolves its text from `theme.colors.auralis`'s shade-2
 * stop, which our tone-based ramp (`mantineColors.ts`) makes a near-white pastel at
 * every hue — legible against `subtle`'s own dark-mode background assumption, but not
 * guaranteed against whatever real surface this button actually sits on.
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
      // Unselected "standard" is neutral; selected turns primary-coloured, matching
      // the old `:not(.selected) { color: on-surface-variant }`.
      return selected
        ? { variant: 'subtle', style: { color: 'var(--m3-primary)' } }
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
      {children}
    </ActionIcon>
  );
});
