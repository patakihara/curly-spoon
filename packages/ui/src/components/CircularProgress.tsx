/**
 * Circular progress — thin wrapper around Mantine primitives, split by mode since
 * Mantine doesn't have one component that does both: `Loader` (a spinner) for
 * indeterminate — the only mode any current `apps/web` caller uses — and
 * `RingProgress` (a single-section ring) for determinate.
 *
 * Both `size` props take raw pixels here (matching the old SVG's `size` prop), but
 * Mantine's `Loader` converts a bare number to *rem*, not px — so it's passed as an
 * explicit `px` string to keep `size={18}` meaning 18px, as every current caller
 * (`LoginPage`, `SetupPage`) expects. `RingProgress`'s `size` is already plain px.
 */
import { Loader, RingProgress } from '@mantine/core';

export interface CircularProgressProps {
  value?: number;
  indeterminate?: boolean;
  size?: number;
  'aria-label'?: string;
}

const STROKE_WIDTH = 4;

export function CircularProgress({
  value,
  indeterminate = value === undefined,
  size = 40,
  'aria-label': ariaLabel,
}: CircularProgressProps) {
  if (indeterminate) {
    return (
      <Loader
        type="oval"
        size={`${size}px`}
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    );
  }

  const percent = Math.min(1, Math.max(0, value ?? 0));

  return (
    <RingProgress
      size={size}
      thickness={STROKE_WIDTH}
      sections={[{ value: percent * 100, color: 'auralis' }]}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent * 100)}
    />
  );
}
