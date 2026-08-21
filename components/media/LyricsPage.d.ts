import { ReactNode } from 'react';

/**
 * Full lyrics page — an app bar naming the page, then the song and the LyricsSyncButton on one row
 * above a scrolling lyric sheet. Reached from the Now Playing lyrics preview or the bottom app bar on
 * mobile; the player panel's Lyrics tab on desktop. Dismissed by the surface that opened it — it
 * carries no back affordance of its own.
 */
export interface LyricsPageProps {
  platform?: 'desktop' | 'mobile';
  /** Page heading. Pass `null` inside the desktop player panel, whose tab already names it. */
  heading?: string | null;
  /** Song the lyrics belong to, shown under the heading. */
  title?: string;
  artist?: string;
  lines?: string[];
  activeIndex?: number;
  syncMode?: 'sync' | 'dot' | 'off';
  onSyncModeChange?: (mode: 'sync' | 'dot' | 'off') => void;
  /** Docked below the sheet — a BottomAppBar, for instance. */
  footer?: ReactNode;
  /** Own the scrolling (the default). Off inside the desktop player panel, which scrolls itself. */
  scroll?: boolean;
  /** Renders the app bar's close button, which collapses the page back into what opened it. */
  onClose?: () => void;
}
export declare function LyricsPage(props: LyricsPageProps): JSX.Element;
