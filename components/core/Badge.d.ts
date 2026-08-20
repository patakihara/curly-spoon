import { ReactNode } from 'react';

/** Small pill for counts, queue positions and status. Colors come from the status tone tokens; ink is always plain black or white. */
export interface BadgeProps {
  children: ReactNode;
  tone?: 'accent' | 'success' | 'warning' | 'error' | 'neutral';
  /** md is the status-pill size used in list rows; sm is the count pill. */
  size?: 'sm' | 'md';
  /** Leading Material Symbols Rounded glyph name — the verified check, the finished tick. */
  icon?: string;
  /** Square with --radius-xs instead of a pill: the explicit-content "E" marker. */
  square?: boolean;
  /** No fill; glyph and label take the tone colour as ink instead of the tone's contrast ink. */
  plain?: boolean;
}
export declare function Badge(props: BadgeProps): JSX.Element;
