import { ReactNode } from 'react';

/**
 * Detail-page header for an album, book, podcast or artist: large art, kind label,
 * title, a subtitle that can link onward (artist/author), meta line and two actions.
 */
export interface MediaHeaderProps {
  /**
   * Layout override. Omit it and the header measures itself, going compact (art on top,
   * centred, smaller type) below `compactAt` — a real breakpoint on its own width, so the
   * same header adapts inside a phone frame or a narrow desktop pane without being told.
   */
  platform?: 'desktop' | 'mobile';
  /** Cover art URL. Falls back to the generated gradient when omitted. */
  image?: string;
  /** Width in px below which the compact layout takes over. Default 600. */
  compactAt?: number;
  /** Uppercase kind line above the title, e.g. "Album", "Audiobook". */
  kindLabel?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  playLabel?: string;
  /** Label on the play-next button. Default "Next". */
  nextLabel?: string;
  /** Label on the play-last button. Default "Last". */
  lastLabel?: string;
  /** Circular art, for artist/author pages. */
  round?: boolean;
  onPlay?: () => void;
  onPlayNext?: () => void;
  onPlayLast?: () => void;
  /** Makes the subtitle an accent-ink link. */
  onSubtitle?: () => void;
  /**
   * Replaces the default Play / Next / Last cluster entirely — a page whose verbs aren't a
   * queue (a show's Follow/notify/settings/overflow, an episode's saved/downloaded/share/
   * overflow). The default cluster renders exactly as it does today when this is absent.
   */
  actions?: ReactNode;
  /** 0–1 resume position; draws a thin rule under the meta line. Omit or pass null for none. */
  progress?: number | null;
}
export declare function MediaHeader(props: MediaHeaderProps): JSX.Element;
