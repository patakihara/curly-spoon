import { ReactNode } from 'react';

export interface NavRailItem {
  key: string;
  label: string;
  /** Material Symbols Rounded glyph name. */
  icon: string;
}

/**
 * Desktop navigation rail — the `--surface-bg-alt` column of RailItems. Animates between
 * `--rail-width-collapsed` (108px) and `--rail-width-expanded` (268px) on the same curve
 * RailItem's highlight uses, so the pill and the rail widen together. Collapsed, it adopts the
 * tab-bar treatment: only the active row shows its label, matching BottomNav.
 *
 * The mobile counterpart is BottomNav, which shares RailItem.
 */
export interface NavRailProps {
  items?: NavRailItem[];
  /**
   * Destinations pinned to the rail's foot, below the items and above `footer` — Settings. Drawn as
   * the same rows, so they light, collapse and click exactly as `items` do.
   */
  footerItems?: NavRailItem[];
  /** Key of the active item, in `items` or `footerItems`. */
  active?: string;
  onChange?: (key: string) => void;
  expanded?: boolean;
  /** Shows the menu toggle above the items when provided. */
  onToggleExpanded?: () => void;
  /** Pinned to the bottom — an account row, theme switch, storage meter. */
  footer?: ReactNode;
  /** Sits between the toggle and the items — a logo or brand mark. */
  header?: ReactNode;
}
export declare function NavRail(props: NavRailProps): JSX.Element;
