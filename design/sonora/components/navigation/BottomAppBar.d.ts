import { ReactNode } from 'react';

export interface BottomAppBarAction {
  key?: string;
  /** Material Symbols glyph name. */
  icon: string;
  /** Accessible name and tooltip. */
  label: string;
  /** Optional visible caption under the glyph. */
  caption?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * Bottom app bar — page-level actions docked to the bottom of a full-screen page, the counterpart to
 * TopAppBar. Now Playing uses it to reach the lyrics and queue pages directly.
 */
export interface BottomAppBarProps {
  actions?: BottomAppBarAction[];
  /** Spread the actions evenly across the bar (default) instead of packing them to one edge. */
  spread?: boolean;
  /** Which edge they pack against when `spread` is off. */
  align?: 'start' | 'end';
  background?: string;
  /** Hairline along the top edge. */
  divider?: boolean;
  /** Pinned to the trailing edge — a primary action, for instance. */
  trailing?: ReactNode;
}
export declare function BottomAppBar(props: BottomAppBarProps): JSX.Element;
