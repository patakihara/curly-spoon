import { ReactNode } from 'react';

/**
 * The player's Lyrics tab: the song and the LyricsSyncButton on one row, the toggle in its top
 * corner, above the lyric sheet. Dismissed by the player that holds it; it carries no back
 * affordance of its own.
 */
export interface LyricsPageProps {
  platform?: 'desktop' | 'mobile';
  /** Page heading. `null` as a tab of the player, whose tab names it. */
  heading?: string | null;
  /** Song the lyrics belong to, shown under the heading. */
  title?: string;
  artist?: string;
  lines?: string[];
  activeIndex?: number;
  syncMode?: 'sync' | 'dot' | 'off';
  /** Whether sync off marks the current line with a dot. Default true; the player's menu turns it off. */
  dot?: boolean;
  onSyncModeChange?: (mode: 'sync' | 'dot' | 'off') => void;
  /** Docked below the sheet. */
  footer?: ReactNode;
  /** Own the scrolling. Defaults to on for mobile, off for desktop, whose player panel scrolls itself. */
  scroll?: boolean;
  /** Renders the app bar's close button, which collapses the page back into what opened it. */
  onClose?: () => void;
}
export declare function LyricsPage(props: LyricsPageProps): JSX.Element;
