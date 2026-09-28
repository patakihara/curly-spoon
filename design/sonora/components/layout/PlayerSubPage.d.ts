import { ReactNode } from 'react';

/**
 * The shell the player's Queue and Lyrics tabs share (QueuePage, LyricsPage): a scrolling body whose
 * first row pairs what the page is about with its controls, under an app bar naming the page when
 * it has a heading or a close button.
 */
export interface PlayerSubPageProps {
  platform?: 'desktop' | 'mobile';
  /** Page name in the app bar. `null` as a tab of the player, whose tab names it: with no close button either, there is no app bar. */
  heading?: string | null;
  /** What the page is about — "Playing from Driftwave", "Song · Artist". */
  meta?: string;
  /** The page's own controls, on the meta row: the sync group, the edit toggle. */
  controls?: ReactNode;
  /** Docked below the body — an edit action bar, a BottomAppBar. */
  footer?: ReactNode;
  /** Own the scrolling. Defaults to on for mobile, off for desktop, whose player panel scrolls itself. */
  scroll?: boolean;
  /** Renders the app bar's close button when set. */
  onClose?: () => void;
  closeGlyph?: string;
  children?: ReactNode;
}
export declare function PlayerSubPage(props: PlayerSubPageProps): JSX.Element;
