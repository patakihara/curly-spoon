/**
 * Navigation rail row, following the M3 rail spec. One highlight element morphs from a
 * 56×32 icon pill (collapsed) to a pill that hugs the icon and label (expanded), so the
 * selection never jumps; two label copies cross-fade rather than travelling. The highlight
 * is always the width of the item's own content, never of the rail.
 *
 * Rows are 56px tall and stack with no gap in either state. Collapsed: 80px rail, 12px side
 * padding. Expanded: 220–360px rail, 16px side padding. The pill carries the row's state layer:
 * hover, focus and a press ripple show on it, and the row is drawn disabled without `onClick`.
 */
export interface RailItemProps {
  /** Material Symbols Rounded glyph name. */
  icon: string;
  label: string;
  active?: boolean;
  /** false collapses to the 56×32 icon pill with a 12px stacked label. */
  expanded?: boolean;
  /** Row height — 56 in a rail, 48 in the bottom tab bar. */
  rowHeight?: number;
  /** Mobile tab-bar behaviour: inactive tabs hide their label and centre the icon; the active tab keeps its label and gets a wider pill. */
  tabs?: boolean;
  /** Whether the active pill widens to 72px. Defaults to `tabs` — set false in a rail. */
  wideActive?: boolean;
  /**
   * Centre the icon against the row's midpoint. Defaults to `tabs`. Must be false wherever the
   * row's width animates (a rail), or the icon slides out and back during the transition.
   */
  centerIcon?: boolean;
  /** The destination's action. Without it the row is drawn disabled. */
  onClick?: () => void;
}
export declare function RailItem(props: RailItemProps): JSX.Element;
