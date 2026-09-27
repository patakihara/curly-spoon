import { ReactNode } from 'react';

/**
 * The shell shared by every page the player opens (LyricsPage, QueuePage): an app bar naming the page,
 * then a scrolling body whose first row pairs what the page is about with its controls. The bar's
 * close button collapses the page back into whatever expanded it.
 */
export interface PlayerSubPageProps {
  platform?: 'desktop' | 'mobile';
  /** Page name in the app bar. `null` inside the desktop player panel, whose tab already names it. */
  heading?: string | null;
  /** What the page is about — "Playing from Driftwave", "Song · Artist". */
  meta?: string;
  /** The page's own controls, on the meta row: the sync group, the edit toggle. */
  controls?: ReactNode;
  /** Docked below the body — an edit action bar, a BottomAppBar. */
  footer?: ReactNode;
  /** Own the scrolling (the default). Off inside the desktop player panel, which scrolls itself. */
  scroll?: boolean;
  /** Renders the app bar's close button when set. */
  onClose?: () => void;
  closeGlyph?: string;
  children?: ReactNode;
}
export declare function PlayerSubPage(props: PlayerSubPageProps): JSX.Element;
