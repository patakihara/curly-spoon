/**
 * Circular progress — a determinate ring, or a spinning indeterminate one (a small
 * fixed arc, so it never reads as "stuck at 100%" the way a full-circle spinner can).
 */
import clsx from 'clsx';
import './CircularProgress.css';

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
  const radius = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.min(1, Math.max(0, value ?? 0));
  const dashOffset = indeterminate ? circumference * 0.75 : circumference * (1 - percent);

  return (
    <svg
      className={clsx('m3-circular-progress', indeterminate && 'm3-circular-progress--indeterminate')}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(percent * 100)}
    >
      <circle
        className="m3-circular-progress__track"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={STROKE_WIDTH}
        fill="none"
      />
      <circle
        className="m3-circular-progress__fill"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={STROKE_WIDTH}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
      />
    </svg>
  );
}
