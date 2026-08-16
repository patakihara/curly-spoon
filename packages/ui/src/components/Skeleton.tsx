/**
 * Loading placeholder — thin wrapper around Mantine's `Skeleton`.
 *
 * Mantine's own shimmer is a raw CSS `@keyframes` animation on the element's
 * `::after` pseudo-element, and — contrary to what an earlier version of this
 * comment claimed — `respectReducedMotion` on `MantineProvider` does **not** touch
 * it: that flag only strips motion from Mantine's JS-driven `Transition` machinery
 * (`Modal`, `Drawer`, `Collapse`, …) via a `[data-reduce-motion]` opt-in attribute
 * that only `Spoiler` ever sets among Mantine's own components (confirmed against
 * `@mantine/core`'s compiled source and CSS — `Skeleton` never sets it). Left alone,
 * a signed-in user with `prefers-reduced-motion: reduce` would see this shimmer
 * regardless. So `animate` is driven explicitly here from the same
 * `prefersReducedMotion`/`watchReducedMotion` this package's `ThemeProvider` already
 * uses for its own colour cross-fade — one reduced-motion source of truth, not two.
 * (The pre-Mantine hand-rolled `Skeleton.css` used to handle this itself. It was
 * superseded by Mantine's `Skeleton`, sat unimported for months, and has now been
 * deleted along with the three other orphaned stylesheets from that migration.)
 *
 * Mantine's `circle` prop derives width from height and ignores `width` entirely,
 * so for `shape="circular"` we fold an incoming `width` into `height` when no
 * `height` was given, to keep `<Skeleton shape="circular" width={48} />` sizing the
 * same as before.
 */
import { Skeleton as MantineSkeleton } from '@mantine/core';
import { useEffect, useState, type HTMLAttributes } from 'react';
import { prefersReducedMotion, watchReducedMotion } from '../theme/reducedMotion.js';

export type SkeletonShape = 'text' | 'circular' | 'rectangular';

export interface SkeletonProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'style'> {
  shape?: SkeletonShape;
  width?: number | string;
  height?: number | string;
}

export function Skeleton({ shape = 'text', width, height, className, ...rest }: SkeletonProps) {
  const isCircular = shape === 'circular';
  const resolvedHeight = height ?? (isCircular ? width : shape === 'text' ? '1em' : undefined);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  useEffect(() => watchReducedMotion(setReducedMotion), []);

  return (
    <MantineSkeleton
      circle={isCircular}
      width={isCircular ? undefined : width}
      height={resolvedHeight}
      radius={shape === 'text' ? 'xs' : isCircular ? undefined : 'md'}
      animate={!reducedMotion}
      className={className}
      aria-hidden="true"
      {...rest}
    />
  );
}
