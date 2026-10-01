import { ReactNode } from 'react';

/**
 * Reports the active sort/filter state and opens its picker in one control — the label is data
 * ("All episodes • Newest"), not a fixed name, so a plain button can't stand in for it.
 */
export interface SortFilterBarProps {
  /** Leading glyph. */
  icon?: string;
  /** The current state, rendered as the control's own label — e.g. "All episodes • Newest". */
  label: string;
  /** Opens the sort/filter picker. Without it the control is drawn disabled. */
  onClick?: () => void;
  /** Right-aligned slot, hard right against the bar's full width — the library puts a ViewToggle here. */
  trailing?: ReactNode;
  platform?: 'desktop' | 'mobile';
}
export declare function SortFilterBar(props: SortFilterBarProps): JSX.Element;
