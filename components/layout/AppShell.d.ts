import { ReactNode } from 'react';

/**
 * The app frame — the one component that ties the layout parts together, so a screen only has
 * to supply its own content. Composes NavRail (or nothing, on mobile) beside a column of
 * TopAppBar + ContentPane, with an optional SideSheet abutting the content and MiniPlayer
 * docked across the full width beneath everything.
 *
 * The shell owns the relationships that are easy to get wrong: the bar spans only the content
 * column, so the sheet runs full height beside it with its title at the bar's level; the player
 * spans everything; and the content pane squares its top-right corner whenever the sheet is open.
 *
 * On mobile pass no `rail` and put the bottom nav in `player` alongside the mini player.
 */
export interface AppShellProps {
  /** The screen itself — goes inside the ContentPane. */
  children?: ReactNode;
  /** A NavRail. Omit on mobile. */
  rail?: ReactNode;
  /** A TopAppBar. */
  bar?: ReactNode;
  /** A SideSheet. */
  sheet?: ReactNode;
  /** Whether that sheet is open — squares the content's abutting corner. */
  sheetOpen?: boolean;
  /** MiniPlayer, BottomNav, or a fragment of both. Docked across the bottom. */
  player?: ReactNode;
  /** Floor for the content column, e.g. `var(--content-min-width)`. */
  contentMinWidth?: string;
  /** Identifier of the current view — gives each one its own remembered scroll position. */
  scrollKey?: string | number;
  /** false when the screen owns its own scrolling (mobile). */
  scroll?: boolean;
  /** 0–1 scroll progress from the content pane. */
  onProgress?: (progress: number) => void;
  /** Sets `data-theme` on the frame. */
  theme?: string;
  /** Flattens the content pane — square top corners and a permanent divider — for a sub-page that owns the full surface. */
  flat?: boolean;
  /** Squares the content pane's top corners while keeping its scroll-linked hairline — used when the app bar's controls row carries the rounding. */
  square?: boolean;
}
export declare function AppShell(props: AppShellProps): JSX.Element;
