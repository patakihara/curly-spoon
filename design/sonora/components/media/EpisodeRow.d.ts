import { ReactNode } from 'react';

/**
 * List row for serial spoken-word content — an episode, not a track. Carries a synopsis, a
 * publication line, a listened/finished state and its own action bar, none of which ResultRow
 * has room for without bending it out of shape for the lists that already use it.
 */
export interface EpisodeRowProps {
  /** Cover art URL. Falls back to whatever CoverArt renders in its absence. */
  image?: string;
  title: string;
  /** Synopsis, clamped to 2 lines. */
  description?: string;
  /** Parts joined with " • ", e.g. ["200K+ plays", "29 Dec 2025", "50min"]. */
  meta?: string[];
  /** Appends a "Finished" marker with a filled check in --tone-library. */
  finished?: boolean;
  /** 0–1 part-listened position; draws a thin rule under the meta line. */
  progress?: number | null;
  /**
   * An episode of a show you don't follow: the art greyed to no colour and the title in muted ink,
   * as MediaCard greys an item you don't own. It still plays.
   */
  absent?: boolean;
  /** Renders the "E" marker before the title. */
  explicit?: boolean;
  /** An ItemActionBar, rendered below the synopsis. */
  actions?: ReactNode;
  /** Given, reveals a play control over the artwork (hover on desktop, always on mobile). */
  onPlay?: () => void;
  onClick?: () => void;
  /** Hairline separator along the bottom, inset to the text column. */
  divider?: boolean;
  platform?: 'desktop' | 'mobile';
}
export declare function EpisodeRow(props: EpisodeRowProps): JSX.Element;
