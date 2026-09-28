/** Seek slider plus the elapsed / remaining readouts. Pass duration in seconds; value is 0–1. */
export interface SeekBarProps {
  value?: number;
  /** Track length in seconds. */
  duration?: number;
  platform?: 'desktop' | 'mobile';
  onChange?: (next: number) => void;
  /** false shows total length on the right instead of a countdown. */
  remainingAsCountdown?: boolean;
}
export declare function SeekBar(props: SeekBarProps): JSX.Element;
