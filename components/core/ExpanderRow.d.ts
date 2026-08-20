/**
 * Collapses a homogeneous group inside an otherwise heterogeneous list — seven versions of one
 * song folded behind "More releases · Show all" so the other result types stay reachable.
 */
export interface ExpanderRowProps {
  /** What is being folded, e.g. "More releases". */
  label: string;
  /** The disclosure verb. */
  actionLabel?: string;
  expanded?: boolean;
  /** Called with the next expanded state on click. */
  onToggle?: (next: boolean) => void;
  /** Optional stacked-art hint, leading the row. */
  image?: string;
}
export declare function ExpanderRow(props: ExpanderRowProps): JSX.Element;
