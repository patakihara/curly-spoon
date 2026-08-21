/**
 * Floating action button, now a thin wrapper over Mantine's `ActionIcon` (icon-only)
 * or `Button` (`extended`, which needs a text label alongside the icon — `ActionIcon`
 * has no slot for that). `sm`/`md`/`lg` are square, sized to match the old M3 scale
 * (40/48/96px) via an explicit pixel `size` rather than Mantine's own size tokens, so
 * the FAB doesn't change shape when Mantine's default scale is retuned elsewhere.
 *
 * Wave 16c-6-W (docs/ROADMAP.md §16): migrated off --m3-* onto Sonora's tokens
 * (docs/design/SONORA.md §1). The FAB's fill has no Mantine theme equivalent either
 * before or after this wave (the `auralis` colour ramp is derived from `scheme.primary`,
 * a different role — see `mantineColors.ts`), so the fill/elevation stays an explicit
 * style override, only the token names underneath it change.
 *
 * Sonora has no "container" surface tier at all (Card.css's comment makes the same
 * observation for `Card`'s `elevated`/`filled` variants), so `--m3-primary-container`/
 * `--m3-on-primary-container` are replaced with the `--accent`/`--accent-contrast`
 * pairing this wave family already uses everywhere a control must read as bold/primary
 * rather than blend into a surface — NavigationBar's active-indicator pill and Chip's
 * checked state are the precedent. A FAB is exactly that kind of control: the one
 * primary action on the screen, meant to stand out. `--m3-elevation-3` is dropped for
 * `--shadow-lg`, the literal value it already equals (Dialog.css's/Sheet.css's identical
 * note — `index.css`'s static fallback pins elevation-3 as byte-for-byte `--shadow-lg`).
 */
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { ActionIcon, Button as MantineButtonPrimitive } from '@mantine/core';
import { SHAPE_SCALE } from '../tokens/shape.js';
import { TOUCH_TARGET_MIN } from '../tokens/spacing.js';
import './Fab.css';

export type FabSize = 'sm' | 'md' | 'lg';

export interface FabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  size?: FabSize;
  /** Renders a pill-shaped extended FAB with a visible label instead of icon-only. */
  extended?: boolean;
  icon: ReactNode;
  /** Required when `extended` is false, since the FAB then has no visible text. */
  label?: ReactNode;
  'aria-label'?: string;
}

const ICON_ONLY_SIZE_PX: Record<FabSize, number> = { sm: 40, md: TOUCH_TARGET_MIN, lg: 96 };
const ICON_ONLY_RADIUS_PX: Record<FabSize, number> = {
  sm: SHAPE_SCALE.lg,
  md: SHAPE_SCALE.lg,
  lg: SHAPE_SCALE.xl,
};

/** `--accent`/`--accent-contrast` + `--shadow-lg`, matching the old `.m3-fab`'s intent. */
const FAB_SURFACE_STYLE: CSSProperties = {
  backgroundColor: 'var(--accent, #8b5cf6)',
  color: 'var(--accent-contrast, #fff)',
  boxShadow: 'var(--shadow-lg, 0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05))',
};

export const Fab = forwardRef<HTMLButtonElement, FabProps>(function Fab(
  { size = 'md', extended = false, icon, label, className, style, ...rest },
  ref,
) {
  const mergedStyle = { ...FAB_SURFACE_STYLE, ...style };

  if (extended) {
    return (
      <MantineButtonPrimitive
        ref={ref}
        type="button"
        variant="filled"
        // Extended FABs are pill-shaped and always the same (touch-target) height in
        // the original design regardless of `size` — only icon-only FABs scale.
        size="md"
        radius={SHAPE_SCALE.full}
        leftSection={icon}
        className={className}
        style={mergedStyle}
        {...rest}
      >
        {label}
      </MantineButtonPrimitive>
    );
  }

  return (
    <ActionIcon
      ref={ref}
      type="button"
      variant="filled"
      size={ICON_ONLY_SIZE_PX[size]}
      radius={ICON_ONLY_RADIUS_PX[size]}
      className={className}
      style={mergedStyle}
      {...rest}
    >
      {icon}
    </ActionIcon>
  );
});
