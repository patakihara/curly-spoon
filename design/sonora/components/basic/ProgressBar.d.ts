import { CSSProperties } from 'react';

/**
 * How far into an item the listener is: a thin pill track filled in the play colour, announced as a
 * progressbar from 0 to 100. Sonora's one linear progress bar: a card's, a row's and a header's
 * resume position all draw it. It fills its container's width.
 */
export interface ProgressBarProps {
  /**
   * 0–1, held to that range. A numeric string such as `'0.5'` reads as its number; `NaN`, or
   * anything else that is no number, reads 0; `Infinity` reads full and `-Infinity` empty.
   */
  value?: number;
  /** A step of the progress ramp: `sm` (default, `--progress-sm`) or `md` (`--progress-md`). */
  size?: 'sm' | 'md';
  /** What it sits on: `surface` (default, a hairline track on the page) or `scrim` (over artwork). */
  tone?: 'surface' | 'scrim';
  /** Its accessible name. Default "Progress". */
  label?: string;
  /** Placement only: position, offsets, margin, width. Never its height, track or fill. */
  style?: CSSProperties;
}
export declare function ProgressBar(props: ProgressBarProps): JSX.Element;
