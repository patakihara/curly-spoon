/**
 * Linear progress: a determinate bar, or an indeterminate one — optionally drawn as
 * M3 Expressive's undulating "wavy" indicator, which reads as motion even in a single
 * still frame (useful for screenshots/reduced-motion, where it simply doesn't scroll).
 */
import clsx from 'clsx';
import './LinearProgress.css';

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
    <div
      className={clsx('m3-linear-progress', wavy && 'm3-linear-progress--wavy')}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : percent}
    >
      <div className="m3-linear-progress__track" />
      {indeterminate ? (
        <div className="m3-linear-progress__indeterminate" />
      ) : (
        <div className="m3-linear-progress__fill" style={{ width: `${percent}%` }} />
      )}
    </div>
  );
}
