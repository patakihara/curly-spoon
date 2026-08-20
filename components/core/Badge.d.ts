import { ReactNode } from 'react';

/** Small pill for counts, queue positions and status. Colors come from the status tone tokens; ink is always plain black or white. */
export interface BadgeProps {
  children: ReactNode;
  tone?: 'accent' | 'success' | 'warning' | 'error' | 'neutral';
  /** md is the status-pill size used in list rows; sm is the count pill. */
  size?: 'sm' | 'md';
}
export declare function Badge(props: BadgeProps): JSX.Element;
