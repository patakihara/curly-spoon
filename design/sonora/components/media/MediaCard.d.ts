/**
 * Shelf/grid card for any library item — album, book, podcast, episode.
 * Cover art is a deterministic tint derived from the title, so a shelf reads as distinct artwork.
 * In a mixed shelf pass the content type as the first part of `sub` ("Book · 6 h 12 m left").
 */
export interface MediaCardProps {
  title: string;
  sub?: string;
  platform?: 'desktop' | 'mobile';
  /** 0–1 resume position; draws a progress bar across the bottom of the art. */
  progress?: number | null;
  /** Not-in-library state: dashed outline plus a "Not in library" pill anchored to the bottom of the art. */
  absent?: boolean;
  /** Fixed track width; pass "100%" to fill a grid cell. */
  width?: string;
  /** 'sm' is the compact carousel size — narrower track, smaller caption type. */
  size?: 'md' | 'sm';
  /**
   * Queue handlers. Given any of them, a desktop card reveals a PlayActions group over its
   * artwork on hover (play next / play / play last). Mobile cards ignore them — no hover.
   */
  onPlay?: () => void;
  onPlayNext?: () => void;
  onPlayLast?: () => void;
  playing?: boolean;
  /** Cover art URL. Falls back to the generated gradient when omitted. */
  image?: string;
  onClick?: () => void;
  /** Renders a corner menu button (top-right) — hover/focus-revealed on desktop, always visible on mobile. */
  onMore?: (e?: any) => void;
  /** Muted line ABOVE the title at text-xs — the type or genre ("Playlist", "Album", "Society & Culture"). Leaves `sub` untouched. */
  eyebrow?: string;
  /** Marks unlistened/new content with a small accent dot on the artwork's top-right. */
  unplayed?: boolean;
  /** Bookmark tab on the artwork's bottom-left, for an item the user has explicitly saved. */
  savedBadge?: boolean;
  /** Small glyphs rendered before `sub` — 'push_pin' pinned, 'download_done' offline — so the caption carries state without a second row. */
  markers?: string[];
}
export declare function MediaCard(props: MediaCardProps): JSX.Element;
