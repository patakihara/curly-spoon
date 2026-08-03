/**
 * Loading placeholder — thin wrapper around Mantine's `Skeleton`, which already
 * ships the shimmer + `prefers-reduced-motion` handling this used to hand-roll in
 * `Skeleton.css` (see `ThemeProvider`'s `MantineProvider` for the reduced-motion
 * wiring; not this file's concern).
 *
 * Mantine's `circle` prop derives width from height and ignores `width` entirely,
 * so for `shape="circular"` we fold an incoming `width` into `height` when no
 * `height` was given, to keep `<Skeleton shape="circular" width={48} />` sizing the
 * same as before.
 */
import { Skeleton as MantineSkeleton } from '@mantine/core';
import type { HTMLAttributes } from 'react';

export type SkeletonShape = 'text' | 'circular' | 'rectangular';

export interface SkeletonProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'style'> {
  shape?: SkeletonShape;
  width?: number | string;
  height?: number | string;
}

export function Skeleton({ shape = 'text', width, height, className, ...rest }: SkeletonProps) {
  const isCircular = shape === 'circular';
  const resolvedHeight = height ?? (isCircular ? width : shape === 'text' ? '1em' : undefined);

  return (
    <MantineSkeleton
      circle={isCircular}
      width={isCircular ? undefined : width}
      height={resolvedHeight}
      radius={shape === 'text' ? 'xs' : isCircular ? undefined : 'md'}
      className={className}
      aria-hidden="true"
      {...rest}
    />
  );
}
