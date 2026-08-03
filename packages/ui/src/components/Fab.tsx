/**
 * Floating action button, now a thin wrapper over Mantine's `ActionIcon` (icon-only)
 * or `Button` (`extended`, which needs a text label alongside the icon — `ActionIcon`
 * has no slot for that). `sm`/`md`/`lg` are square, sized to match the old M3 scale
 * (40/48/96px) via an explicit pixel `size` rather than Mantine's own size tokens, so
 * the FAB doesn't change shape when Mantine's default scale is retuned elsewhere.
 *
 * M3's `primary-container` surface (the FAB's fill) has no equivalent in the Mantine
 * theme's `auralis` colour ramp (that ramp is derived from `scheme.primary`, a
 * different M3 role — see `mantineColors.ts`), so the fill/elevation is applied as an
 * explicit style override referencing the M3 CSS custom properties directly, the same
 * approach `Button`'s `elevated` variant uses.
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

/** `primary-container`/`on-primary-container` + elevation-3, matching the old `.m3-fab`. */
const FAB_SURFACE_STYLE: CSSProperties = {
  backgroundColor: 'var(--m3-primary-container)',
  color: 'var(--m3-on-primary-container)',
  boxShadow: 'var(--m3-elevation-3, 0 4px 8px rgba(0, 0, 0, 0.3))',
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
