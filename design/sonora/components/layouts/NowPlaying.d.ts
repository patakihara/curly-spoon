import { ReactNode } from 'react';
import { NowPlayingPageProps } from './NowPlayingPage';
import { LyricsPageProps } from './LyricsPage';
import { QueuePageProps } from './QueuePage';

/**
 * The player, whole, with Now playing, Queue and Lyrics as its tabs (spoken content has no Lyrics
 * tab), in the shape each platform wants.
 *
 * Mobile: a full-screen sheet over everything, the bottom bar included, expanding out of the
 * mini-player (`from` = the bar's rect): an app bar with collapse, what it plays from and the menu,
 * the tabs, then the active tab's page.
 *
 * Desktop: the side panel, `PlayerPanel`; the player bar beneath the window carries the transport.
 */
export interface NowPlayingProps {
  platform?: 'desktop' | 'mobile';
  open?: boolean;
  /** Mobile only: the mini player's viewport rect, so the sheet grows out of it. */
  from?: { top: number; left: number; width: number; height: number } | null;
  /** Collapses the sheet back to the bar, or closes the panel. */
  onClose?: () => void;
  /** Mobile only: the app bar's menu. */
  onMore?: () => void;
  /** The active tab: 'now', 'queue' or 'lyrics'. Omit to let the player own it. */
  tab?: 'now' | 'queue' | 'lyrics' | string;
  onTabChange?: (tab: string) => void;
  /** `spoken` drops the Lyrics tab and gives Now playing the spoken transport. */
  variant?: 'music' | 'spoken';
  track?: { image?: string; title?: string; artist?: string; context?: string };
  /** Playback state and handlers for the built Now playing tab. */
  player?: Omit<NowPlayingPageProps, 'platform' | 'variant' | 'image' | 'title' | 'artist' | 'context' | 'scroll' | 'children'>;
  /** The built Lyrics tab: lines, the line being sung, and the sync mode. */
  lyrics?: Pick<LyricsPageProps, 'lines' | 'activeIndex' | 'syncMode' | 'onSyncModeChange' | 'dot'>;
  /** The built Queue tab. */
  queue?: Omit<QueuePageProps, 'platform' | 'heading' | 'scroll' | 'footer' | 'onClose'>;
  zIndex?: number;
  /** The active tab's page, in place of the one the player builds. */
  children?: ReactNode;
}
export declare function NowPlaying(props: NowPlayingProps): JSX.Element;
