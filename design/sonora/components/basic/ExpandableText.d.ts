import { ReactNode } from 'react';

/**
 * Long prose that neither dominates nor hides — a paragraph clamped with -webkit-line-clamp,
 * with a real, keyboard-reachable toggle. Distinct from ExpanderRow, which folds a homogeneous
 * list group rather than a paragraph.
 */
export interface ExpandableTextProps {
  /** The prose. `text` is the alternative when JSX children aren't convenient. */
  children?: ReactNode;
  text?: string;
  /** Lines shown before clamping. */
  lines?: number;
  moreLabel?: string;
  lessLabel?: string;
  /** Controlled expanded state. Omit to let the component keep its own. */
  expanded?: boolean;
  /** Receives the next expanded state. Without it the toggle is drawn disabled. */
  onToggle?: (next: boolean) => void;
}
export declare function ExpandableText(props: ExpandableTextProps): JSX.Element;
