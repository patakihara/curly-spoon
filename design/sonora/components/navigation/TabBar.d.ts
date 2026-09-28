/**
 * Icon + label tabs for the second row of a TopAppBar — the sub-sections of a library page
 * (Artists / Albums / Songs, Authors / Books / Series / Narrators). Scrolls sideways when the
 * labels outrun the width; the active tab is accent-coloured with an underline indicator.
 * For a filter row of mutually exclusive pills use ButtonGroup instead.
 */
export interface TabBarItem {
  key: string;
  label?: string;
  /** Material Symbols Rounded glyph name, e.g. 'album'. */
  icon?: string;
}
export interface TabBarProps {
  items: (TabBarItem | string)[];
  value?: string;
  onChange?: (key: string) => void;
  platform?: 'desktop' | 'mobile';
  /** Share the row's width equally among the tabs, never scrolling: for a row of a few, like the player's. */
  fill?: boolean;
}
export declare function TabBar(props: TabBarProps): JSX.Element;
