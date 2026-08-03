/**
 * Linear progress — thin wrapper around Mantine's `Progress`. The determinate path
 * (the only one any current `apps/web` caller uses) maps directly onto Mantine's
 * `Progress.Section` `value` (0-100 vs. this component's public 0..1).
 *
 * Mantine has no built-in indeterminate mode, so this uses `Progress.Root` +
 * `Progress.Section` (rather than the `<Progress>` convenience wrapper, which
 * requires a numeric `value` and derives `aria-valuenow` from it) so an
 * indeterminate bar can carry `role="progressbar"` without ever claiming a fake
 * numeric value: `withAria={false}` on the section drops both `role` and
 * `aria-valuenow` there instead of reporting 100% complete, and `role="progressbar"`
 * is added to the *root* only in that case — confirmed against the gallery that
 * `Progress.Section`'s own `role="progressbar"` (its `withAria` default) would
 * otherwise coexist with the root's, giving two matching nodes for one bar. The
 * "still busy" motion comes from Mantine's own `animated`+`striped` scrolling
 * stripes at full width, in place of the previous hand-rolled sliding-bar/wavy-SVG
 * CSS animation.
 *
 * `wavy` (an M3 Expressive-only affordance — an undulating stroke — has no Mantine
 * equivalent) now only thickens the bar; it no longer renders a distinct wave.
 */
import { Progress } from '@mantine/core';

export interface LinearProgressProps {
  /** 0..1. Omit (or set `indeterminate`) for an indeterminate bar. */
  value?: number;
  indeterminate?: boolean;
  wavy?: boolean;
  'aria-label'?: string;
}

export function LinearProgress({
  value,
  indeterminate = value === undefined,
  wavy = false,
  'aria-label': ariaLabel,
}: LinearProgressProps) {
  const percent = Math.min(100, Math.max(0, (value ?? 0) * 100));

  return (
    <Progress.Root
      size={wavy ? 8 : 4}
      radius="xl"
      role={indeterminate ? 'progressbar' : undefined}
      aria-label={indeterminate ? ariaLabel : undefined}
    >
      <Progress.Section
        value={indeterminate ? 100 : percent}
        withAria={!indeterminate}
        animated={indeterminate}
        striped={indeterminate}
        aria-label={indeterminate ? undefined : ariaLabel}
      />
    </Progress.Root>
  );
}
