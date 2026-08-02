/**
 * Loading placeholder. Shimmers to signal "still loading" without implying false
 * progress; honours `prefers-reduced-motion` by holding still instead (the global
 * reduced-motion rule in styles/index.css already collapses the animation duration,
 * this component just also drops the sliding gradient position so it doesn't flash).
 */
import clsx from 'clsx';
import type { CSSProperties } from 'react';
import './Skeleton.css';

export type SkeletonShape = 'text' | 'circular' | 'rectangular';

export interface SkeletonProps {
  shape?: SkeletonShape;
  width?: number | string;
  height?: number | string;
  className?: string;
}

export function Skeleton({ shape = 'text', width, height, className }: SkeletonProps) {
  const style: CSSProperties = {
    width,
    height: height ?? (shape === 'text' ? '1em' : undefined),
  };

  return (
    <span
      className={clsx('m3-skeleton', `m3-skeleton--${shape}`, className)}
      style={style}
      aria-hidden="true"
    />
  );
}
